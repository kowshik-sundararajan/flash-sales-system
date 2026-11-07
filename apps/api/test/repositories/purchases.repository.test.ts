import type { Redis } from "ioredis";
import { describe, expect, test, vi } from "vitest";
import { PURCHASE_CODE } from "../../src/models/purchase.model.js";
import { RedisPurchasesRepository } from "../../src/repositories/purchase.repository.js";
import { saleIdSchema } from "../../src/schemas/sale.schema.js";
import { userIdSchema } from "../../src/schemas/userId.schema.js";

const SALE_ID = saleIdSchema.parse("8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f");
const USER_ID = userIdSchema.parse("johndoe30");

function fakeRedis(evalImpl: ReturnType<typeof vi.fn>) {
  return { eval: evalImpl } as unknown as Redis;
}

describe("RedisPurchasesRepository", () => {
  test("evals the script with two keys sharing one hash tag, and the user id", async () => {
    const evalFn = vi.fn().mockResolvedValue(PURCHASE_CODE.PURCHASED);

    await new RedisPurchasesRepository(fakeRedis(evalFn)).purchase(
      SALE_ID,
      USER_ID,
    );

    expect(evalFn).toHaveBeenCalledOnce();
    expect(evalFn).toHaveBeenCalledWith(
      expect.stringContaining("redis.call"),
      2,
      `{sale:${SALE_ID}}:sale`,
      `{sale:${SALE_ID}}:user:${USER_ID}`,
    );
  });

  test("keys share the {sale:<id>} hash tag so they land in one cluster slot", async () => {
    const evalFn = vi.fn().mockResolvedValue(PURCHASE_CODE.PURCHASED);

    await new RedisPurchasesRepository(fakeRedis(evalFn)).purchase(
      SALE_ID,
      USER_ID,
    );

    const [, , saleKey, userKey] = evalFn.mock.calls[0] as string[];
    const tag = (key: string) => /\{[^}]+\}/.exec(key)?.[0];
    expect(tag(saleKey!)).toBe(`{sale:${SALE_ID}}`);
    expect(tag(userKey!)).toBe(tag(saleKey!));
  });

  test.each(Object.values(PURCHASE_CODE))(
    "returns the script result %s as is",
    async (code) => {
      const evalFn = vi.fn().mockResolvedValue(code);

      await expect(
        new RedisPurchasesRepository(fakeRedis(evalFn)).purchase(
          SALE_ID,
          USER_ID,
        ),
      ).resolves.toBe(code);
    },
  );

  test("lets Redis errors propagate untouched", async () => {
    const error = new Error("connection closed");
    const evalFn = vi.fn().mockRejectedValue(error);

    await expect(
      new RedisPurchasesRepository(fakeRedis(evalFn)).purchase(
        SALE_ID,
        USER_ID,
      ),
    ).rejects.toBe(error);
  });
});

describe("RedisPurchasesRepository.getPurchasedAt", () => {
  function fakeRedisGet(get: ReturnType<typeof vi.fn>) {
    return { get } as unknown as Redis;
  }

  test("reads the user key under the sale's hash tag", async () => {
    const get = vi.fn().mockResolvedValue(null);

    await new RedisPurchasesRepository(fakeRedisGet(get)).getPurchasedAt(
      SALE_ID,
      USER_ID,
    );

    expect(get).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith(`{sale:${SALE_ID}}:user:${USER_ID}`);
  });

  test("returns the stored timestamp as a number", async () => {
    const get = vi.fn().mockResolvedValue("1700000000123");

    await expect(
      new RedisPurchasesRepository(fakeRedisGet(get)).getPurchasedAt(
        SALE_ID,
        USER_ID,
      ),
    ).resolves.toBe(1_700_000_000_123);
  });

  test("returns null when the user has no purchase", async () => {
    const get = vi.fn().mockResolvedValue(null);

    await expect(
      new RedisPurchasesRepository(fakeRedisGet(get)).getPurchasedAt(
        SALE_ID,
        USER_ID,
      ),
    ).resolves.toBeNull();
  });

  test("lets Redis errors propagate untouched", async () => {
    const error = new Error("connection closed");
    const get = vi.fn().mockRejectedValue(error);

    await expect(
      new RedisPurchasesRepository(fakeRedisGet(get)).getPurchasedAt(
        SALE_ID,
        USER_ID,
      ),
    ).rejects.toBe(error);
  });
});
