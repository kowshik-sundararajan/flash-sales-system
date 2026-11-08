import { afterAll, describe, expect, inject, test } from "vitest";
import { createMongoClient, createRedisClient } from "../../src/bootstrap.js";
import { saleIdSchema } from "../../src/schemas/sale.schema.js";

const api = inject("apiUrl");
const soldOut = saleIdSchema.parse(inject("sales").invariantsSoldOut);
const partial = saleIdSchema.parse(inject("sales").invariantsPartial);
const json = { "content-type": "application/json" };

const mongo = createMongoClient(inject("mongoUrl"));
const redis = createRedisClient(inject("redisUrl"), () => {});
await Promise.all([mongo.connect(), redis.connect()]);
afterAll(async () => {
  await mongo.close();
  redis.destroy();
});
const db = mongo.db();

import type { Db } from "mongodb";
import type { RedisClient } from "../../src/bootstrap.js";
import {
  PURCHASES_COLLECTION_NAME,
  saleKeys,
} from "../../src/repositories/purchases.repository.js";
import { PURCHASE_SYNC_GROUP } from "../../src/repositories/purchaseStream.repository.js";
import {
  SALES_COLLECTION_NAME,
  type SaleDocument,
} from "../../src/repositories/sales.repository.js";
import type { SaleId } from "../../src/schemas/sale.schema.js";
import type { UserId } from "../../src/schemas/userId.schema.js";

export interface Snapshot {
  initialStock: number;
  remainingInMongo: number;
  purchasesInMongo: number;
  distinctBuyers: number;
  stockInRedis: number;
  buyerKeysInRedis: number;
  streamLength: number;
  pendingEntries: number;
  deadLetters: number;
}

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export async function takeSnapshot(
  db: Db,
  redis: RedisClient,
  saleId: SaleId,
): Promise<Snapshot> {
  const sale = await db
    .collection<SaleDocument>(SALES_COLLECTION_NAME)
    .findOne({ _id: saleId });
  if (!sale) throw new Error(`sale not found: ${saleId}`);

  const purchases = db.collection(PURCHASES_COLLECTION_NAME);

  let buyerKeysInRedis = 0;
  for await (const keysBatch of redis.scanIterator({
    MATCH: saleKeys.user(saleId, "*" as UserId), // glob over every buyer key
    COUNT: 1000,
  })) {
    buyerKeysInRedis += keysBatch.length;
  }

  const [purchasesInMongo, buyers, stock, streamLength, pending, deadLetters] =
    await Promise.all([
      purchases.countDocuments({ saleId }),
      purchases.distinct("userId", { saleId }),
      redis.hGet(saleKeys.sale(saleId), "stock"),
      redis.xLen(saleKeys.stream(saleId)),
      redis.xPending(saleKeys.stream(saleId), PURCHASE_SYNC_GROUP),
      redis.xLen(saleKeys.deadLetter(saleId)),
    ]);

  return {
    initialStock: sale.stock.initial,
    remainingInMongo: sale.stock.remaining,
    purchasesInMongo,
    distinctBuyers: buyers.length,
    stockInRedis: Number(stock),
    buyerKeysInRedis,
    streamLength,
    pendingEntries: pending.pending,
    deadLetters,
  };
}

/** Every rule that must hold once the workers have synced a sale. */
export function evaluateInvariants(
  snapshot: Snapshot,
  expectedPurchases: number,
): Check[] {
  const left = snapshot.initialStock - snapshot.purchasesInMongo;

  return [
    {
      name: "sold exactly the expected number of items",
      ok: snapshot.purchasesInMongo === expectedPurchases,
      detail: `${snapshot.purchasesInMongo} purchases in Mongo, expected ${expectedPurchases}`,
    },
    {
      name: "never sold more than the stock",
      ok: snapshot.purchasesInMongo <= snapshot.initialStock,
      detail: `${snapshot.purchasesInMongo} purchases, stock was ${snapshot.initialStock}`,
    },
    {
      name: "no user bought twice",
      ok: snapshot.distinctBuyers === snapshot.purchasesInMongo,
      detail: `${snapshot.distinctBuyers} distinct buyers for ${snapshot.purchasesInMongo} purchases`,
    },
    {
      name: "Mongo stock matches the purchases",
      ok: snapshot.remainingInMongo === left,
      detail: `remaining ${snapshot.remainingInMongo}, expected ${left}`,
    },
    {
      name: "Redis stock matches and is not negative",
      ok: snapshot.stockInRedis === left && snapshot.stockInRedis >= 0,
      detail: `Redis stock ${snapshot.stockInRedis}, expected ${left}`,
    },
    {
      name: "Redis buyer records match Mongo",
      ok: snapshot.buyerKeysInRedis === snapshot.purchasesInMongo,
      detail: `${snapshot.buyerKeysInRedis} buyer keys, ${snapshot.purchasesInMongo} purchases`,
    },
    {
      name: "the stream is fully synced",
      ok: snapshot.streamLength === 0 && snapshot.pendingEntries === 0,
      detail: `${snapshot.streamLength} entries left, ${snapshot.pendingEntries} pending`,
    },
    {
      name: "nothing was dead-lettered",
      ok: snapshot.deadLetters === 0,
      detail: `${snapshot.deadLetters} dead-lettered entries`,
    },
  ];
}

export async function failingInvariants(
  db: Db,
  redis: RedisClient,
  saleId: SaleId,
  expectedPurchases: number,
): Promise<string[]> {
  const current = await takeSnapshot(db, redis, saleId);
  return evaluateInvariants(current, expectedPurchases)
    .filter((check) => !check.ok)
    .map((check) => `${check.name}: ${check.detail}`);
}

// Every user presses "Buy now" `clicks` times, all at once.
async function rush(saleId: string, users: number, clicks: number) {
  const url = `${api}/api/sales/${saleId}/purchases`;
  const responses = await Promise.all(
    Array.from({ length: users * clicks }, (_, index) =>
      fetch(url, {
        method: "POST",
        headers: json,
        body: JSON.stringify({ userId: `shopper${index % users}` }),
      }),
    ),
  );
  return Promise.all(
    responses.map(async (response) => (await response.json()).code),
  );
}

// Sync is asynchronous, so poll until every invariant holds (or time out).
const synced = { timeout: 15_000, interval: 200 };

describe("invariants hold on the real state after a rush", () => {
  test("200 shoppers, 2 clicks each, for 30 items: sold out, nothing oversold, lost or doubled", async () => {
    const codes = await rush(soldOut, 200, 2);

    expect(codes.filter((code) => code === "PURCHASED")).toHaveLength(30);
    await expect
      .poll(() => failingInvariants(db, redis, soldOut, 30), synced)
      .toEqual([]);
  });

  test("20 shoppers, 3 clicks each, for 50 items: 20 sold, 30 left in both stores", async () => {
    const codes = await rush(partial, 20, 3);

    expect(codes.filter((code) => code === "PURCHASED")).toHaveLength(20);
    expect(codes.filter((code) => code === "ALREADY_PURCHASED")).toHaveLength(
      40,
    );
    await expect
      .poll(() => failingInvariants(db, redis, partial, 20), synced)
      .toEqual([]);
  });
});
