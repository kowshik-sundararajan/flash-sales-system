import { afterAll, describe, expect, inject, test } from "vitest";
import { createMongoClient, createRedisClient } from "../../src/bootstrap.js";
import {
  PURCHASES_COLLECTION_NAME,
  saleKeys,
} from "../../src/repositories/purchases.repository.js";
import {
  SALES_COLLECTION_NAME,
  type SaleDocument,
} from "../../src/repositories/sales.repository.js";
import { saleIdSchema } from "../../src/schemas/sale.schema.js";
import { userIdSchema } from "../../src/schemas/userId.schema.js";

const api = inject("apiUrl");
const live = saleIdSchema.parse(inject("sales").live);
const rush = saleIdSchema.parse(inject("sales").rush);
const upcoming = saleIdSchema.parse(inject("sales").upcoming);
const ended = saleIdSchema.parse(inject("sales").ended);
const json = { "content-type": "application/json" };
const wait = { timeout: 10_000 };

const mongo = createMongoClient(inject("mongoUrl"));
const redis = createRedisClient(inject("redisUrl"), () => {});
await Promise.all([mongo.connect(), redis.connect()]);
afterAll(async () => {
  await mongo.close();
  redis.destroy();
});
const purchases = mongo.db().collection(PURCHASES_COLLECTION_NAME);
const sales = mongo.db().collection<SaleDocument>(SALES_COLLECTION_NAME);

const stockInRedis = async (saleId: typeof live) =>
  Number(await redis.hGet(saleKeys.sale(saleId), "stock"));

describe("a live sale", () => {
  const buyUrl = `${api}/api/sales/${live}/purchases`;

  test("a shopper buys the item: Redis decides it at once, Mongo gets it, and nobody gets a second one", async () => {
    const stockBefore = await stockInRedis(live);
    const body = JSON.stringify({ userId: "ana" });

    const bought = await fetch(buyUrl, { method: "POST", headers: json, body });
    expect(bought.status).toBe(201);
    expect(await bought.json()).toEqual({ code: "PURCHASED" });

    // Redis: one item off the stock, and a record of who bought and when
    expect(await stockInRedis(live)).toBe(stockBefore - 1);
    const boughtAt = await redis.get(
      saleKeys.user(live, userIdSchema.parse("ana")),
    );
    expect(Number(boughtAt)).toBeGreaterThan(0);

    // Mongo: the purchase is saved with the same time, and the sale's stock follows
    await expect
      .poll(
        () => purchases.countDocuments({ saleId: live, userId: "ana" }),
        wait,
      )
      .toBe(1);
    expect(
      (await purchases.findOne({ saleId: live, userId: "ana" }))?.purchasedAt,
    ).toBe(Number(boughtAt));
    await expect
      .poll(
        async () => (await sales.findOne({ _id: live }))?.stock.remaining,
        wait,
      )
      .toBe(stockBefore - 1);

    // trying again changes nothing anywhere
    const again = await fetch(buyUrl, { method: "POST", headers: json, body });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ code: "ALREADY_PURCHASED" });
    expect(await stockInRedis(live)).toBe(stockBefore - 1);
    await expect.poll(() => redis.xLen(saleKeys.stream(live)), wait).toBe(0);
    expect(
      await purchases.countDocuments({ saleId: live, userId: "ana" }),
    ).toBe(1);
  });

  test("one shopper clicking 100 times at once gets exactly one item, in Redis and in Mongo", async () => {
    const stockBefore = await stockInRedis(live);
    const body = JSON.stringify({ userId: "clicky" });

    const replies = await Promise.all(
      Array.from({ length: 100 }, () =>
        fetch(buyUrl, { method: "POST", headers: json, body }),
      ),
    );

    const codes = await Promise.all(
      replies.map(async (r) => (await r.json()).code),
    );
    expect(codes.filter((code) => code === "PURCHASED")).toHaveLength(1);
    expect(codes.filter((code) => code === "ALREADY_PURCHASED")).toHaveLength(
      99,
    );
    expect(await stockInRedis(live)).toBe(stockBefore - 1);
    await expect
      .poll(
        () => purchases.countDocuments({ saleId: live, userId: "clicky" }),
        wait,
      )
      .toBe(1);
    await expect.poll(() => redis.xLen(saleKeys.stream(live)), wait).toBe(0);
    expect(
      await purchases.countDocuments({ saleId: live, userId: "clicky" }),
    ).toBe(1);
  });
});

describe("a rush", () => {
  test('150 shoppers press "Buy now" twice for 25 items: nothing is oversold, lost or doubled', async () => {
    const url = `${api}/api/sales/${rush}/purchases`;
    const stock = (await sales.findOne({ _id: rush }))!.stock.initial;

    const replies = await Promise.all(
      Array.from({ length: 300 }, (_, i) =>
        fetch(url, {
          method: "POST",
          headers: json,
          body: JSON.stringify({ userId: `user${i % 150}` }),
        }),
      ),
    );

    // exactly one reply per item says PURCHASED; every other one is refused
    const codes = await Promise.all(
      replies.map(async (r) => (await r.json()).code),
    );
    expect(codes.filter((code) => code === "PURCHASED")).toHaveLength(stock);
    expect(
      codes.filter(
        (c) => !["PURCHASED", "SOLD_OUT", "ALREADY_PURCHASED"].includes(c),
      ),
    ).toEqual([]);

    // Redis: the stock is gone, never negative, and one record per buyer
    expect(await stockInRedis(rush)).toBe(0);
    const keys = await redis.keys(saleKeys.all(rush));
    expect(keys.filter((key) => key.includes(":user:"))).toHaveLength(stock);

    // Mongo: every purchase is saved once, and the sale's stock follows
    await expect
      .poll(() => purchases.countDocuments({ saleId: rush }), wait)
      .toBe(stock);
    expect((await purchases.distinct("userId", { saleId: rush })).length).toBe(
      stock,
    );
    await expect
      .poll(
        async () => (await sales.findOne({ _id: rush }))?.stock.remaining,
        wait,
      )
      .toBe(0);

    // nothing is left unsynced or dead-lettered
    await expect.poll(() => redis.xLen(saleKeys.stream(rush)), wait).toBe(0);
    expect(await redis.xLen(saleKeys.deadLetter(rush))).toBe(0);
  });
});

describe("outside the sale window", () => {
  test.each([
    { when: "before the sale opens", sale: upcoming, code: "NOT_STARTED" },
    { when: "after the sale closes", sale: ended, code: "ENDED" },
  ])("nobody can buy $when, and no data changes", async ({ sale, code }) => {
    const initial = (await sales.findOne({ _id: sale }))!.stock.initial;

    const reply = await fetch(`${api}/api/sales/${sale}/purchases`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ userId: "ana" }),
    });

    expect(reply.status).toBe(409);
    expect(await reply.json()).toEqual({ code });
    expect(await stockInRedis(sale)).toBe(initial);
    expect(
      await redis.exists(saleKeys.user(sale, userIdSchema.parse("ana"))),
    ).toBe(0);
    expect(await purchases.countDocuments({ saleId: sale })).toBe(0);
  });
});
