import type { Redis } from "ioredis";
import { describe, expect, test, vi } from "vitest";
import { PURCHASE_CODE } from "../../src/models/purchase.model.js";
import { RedisPurchasesRepository } from "../../src/repositories/purchase.repository.js";
import { saleIdSchema } from "../../src/schemas/sale.schema.js";
import { userIdSchema } from "../../src/schemas/userId.schema.js";

const SALE_ID = saleIdSchema.parse("8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f");
const USER_ID = userIdSchema.parse("6b1f6f0e-3c1a-4a43-8f55-0d6c1b2a9e10");

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
