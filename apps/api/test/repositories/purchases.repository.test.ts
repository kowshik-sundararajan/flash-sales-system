import {
  MongoBulkWriteError,
  type BulkWriteResult,
  type WriteError,
} from "mongodb";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CommandTimeoutError } from "../../src/errors/errors.js";
import {
  PURCHASE_CODE,
  type Purchase,
} from "../../src/models/purchase.model.js";
import {
  ensurePurchaseIndexes,
  MongoPurchasesRepository,
  RedisPurchasesRepository,
} from "../../src/repositories/purchases.repository.js";
import type { RedisClient } from "../../src/bootstrap.js";
import { OTHER_USER_ID, SALE_ID, USER_ID } from "../fixtures.js";
import { fakeDb } from "../helper.js";

const DUPLICATE_KEY = 11000;

function fakeRedis(evalImpl: ReturnType<typeof vi.fn>) {
  return { eval: evalImpl } as unknown as RedisClient;
}

describe("RedisPurchasesRepository", () => {
  test("evals the script with three keys sharing one hash tag, plus the sale id and user id", async () => {
    const evalFn = vi.fn().mockResolvedValue(PURCHASE_CODE.PURCHASED);

    await new RedisPurchasesRepository(fakeRedis(evalFn)).purchase(
      SALE_ID,
      USER_ID,
    );

    expect(evalFn).toHaveBeenCalledOnce();
    expect(evalFn).toHaveBeenCalledWith(expect.stringContaining("redis.call"), {
      keys: [
        `{sale:${SALE_ID}}:sale`,
        `{sale:${SALE_ID}}:user:${USER_ID}`,
        `{sale:${SALE_ID}}:purchases`,
      ],
      arguments: [SALE_ID, USER_ID, expect.any(String)],
    });
  });

  test("keys share the {sale:<id>} hash tag so they land in one cluster slot", async () => {
    const evalFn = vi.fn().mockResolvedValue(PURCHASE_CODE.PURCHASED);

    await new RedisPurchasesRepository(fakeRedis(evalFn)).purchase(
      SALE_ID,
      USER_ID,
    );

    const [saleKey, userKey, streamKey] = evalFn.mock.calls[0]![1]
      .keys as string[];
    const tag = (key: string) => /\{[^}]+\}/.exec(key)?.[0];
    expect(tag(saleKey!)).toBe(`{sale:${SALE_ID}}`);
    expect(tag(userKey!)).toBe(tag(saleKey!));
    expect(tag(streamKey!)).toBe(tag(saleKey!));
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

describe("RedisPurchasesRepository deadline", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("tells the script when the API will have given up: now plus the timeout", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const evalFn = vi.fn().mockResolvedValue(PURCHASE_CODE.PURCHASED);

    await new RedisPurchasesRepository(fakeRedis(evalFn), 750).purchase(
      SALE_ID,
      USER_ID,
    );

    expect(evalFn.mock.calls[0]![1].arguments).toEqual([
      SALE_ID,
      USER_ID,
      "1700000000750",
    ]);
  });

  test("a purchase the script refused as expired becomes a timeout, never a result", async () => {
    const evalFn = vi.fn().mockResolvedValue("EXPIRED");

    await expect(
      new RedisPurchasesRepository(fakeRedis(evalFn)).purchase(
        SALE_ID,
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(CommandTimeoutError);
  });
});

describe("RedisPurchasesRepository command timeout", () => {
  const hangs = () => new Promise<never>(() => {});

  test("a purchase fails fast when Redis does not answer in time", async () => {
    const repo = new RedisPurchasesRepository(fakeRedis(vi.fn(hangs)), 20);

    await expect(repo.purchase(SALE_ID, USER_ID)).rejects.toThrow(
      "timed out after 20ms",
    );
  });

  test("so does reading a purchase time", async () => {
    const repo = new RedisPurchasesRepository(
      { get: vi.fn(hangs) } as unknown as RedisClient,
      20,
    );

    await expect(repo.getPurchasedAt(SALE_ID, USER_ID)).rejects.toThrow(
      "timed out after 20ms",
    );
  });

  test("an answer in time is returned as is", async () => {
    const repo = new RedisPurchasesRepository(
      fakeRedis(vi.fn().mockResolvedValue(PURCHASE_CODE.PURCHASED)),
      1_000,
    );

    await expect(repo.purchase(SALE_ID, USER_ID)).resolves.toBe(
      PURCHASE_CODE.PURCHASED,
    );
  });
});

describe("RedisPurchasesRepository.getPurchasedAt", () => {
  function fakeRedisGet(get: ReturnType<typeof vi.fn>) {
    return { get } as unknown as RedisClient;
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

function purchaseOf(
  userId = USER_ID,
  purchasedAt = 1_700_000_000_000,
): Purchase {
  return { saleId: SALE_ID, userId, purchasedAt };
}

function bulkWriteError(
  insertedCount: number,
  writeErrorCodes: number[],
): MongoBulkWriteError {
  return new MongoBulkWriteError(
    {
      message: "bulk write failed",
      code: writeErrorCodes[0] ?? 64,
      writeErrors: writeErrorCodes.map((code) => ({ code }) as WriteError),
    },
    { insertedCount } as BulkWriteResult,
  );
}

describe("MongoPurchasesRepository", () => {
  test("uses the purchases collection", () => {
    const { db, collection } = fakeDb({});

    new MongoPurchasesRepository(db);

    expect(collection).toHaveBeenCalledWith("purchases");
  });

  describe("insertMany", () => {
    test("an empty list returns 0 and does not call Mongo", async () => {
      const insertMany = vi.fn();
      const { db } = fakeDb({ insertMany });

      const inserted = await new MongoPurchasesRepository(db).insertMany([]);

      expect(inserted).toBe(0);
      expect(insertMany).not.toHaveBeenCalled();
    });

    test("a normal insert returns the driver's insertedCount, unordered", async () => {
      const insertMany = vi.fn().mockResolvedValue({ insertedCount: 2 });
      const { db } = fakeDb({ insertMany });
      const purchases = [purchaseOf(USER_ID), purchaseOf(OTHER_USER_ID)];

      const inserted = await new MongoPurchasesRepository(db).insertMany(
        purchases,
      );

      expect(inserted).toBe(2);
      expect(insertMany).toHaveBeenCalledWith(purchases, { ordered: false });
    });

    test("a batch with some duplicates returns only the new count", async () => {
      const insertMany = vi
        .fn()
        .mockRejectedValue(bulkWriteError(1, [DUPLICATE_KEY]));
      const { db } = fakeDb({ insertMany });

      const inserted = await new MongoPurchasesRepository(db).insertMany([
        purchaseOf(USER_ID),
        purchaseOf(OTHER_USER_ID),
      ]);

      expect(inserted).toBe(1);
    });

    test("a batch of only duplicates returns 0", async () => {
      const insertMany = vi
        .fn()
        .mockRejectedValue(bulkWriteError(0, [DUPLICATE_KEY, DUPLICATE_KEY]));
      const { db } = fakeDb({ insertMany });

      const inserted = await new MongoPurchasesRepository(db).insertMany([
        purchaseOf(USER_ID),
        purchaseOf(OTHER_USER_ID),
      ]);

      expect(inserted).toBe(0);
    });

    test("rethrows a bulk error that mixes duplicates with another failure", async () => {
      const error = bulkWriteError(0, [DUPLICATE_KEY, 121]);
      const { db } = fakeDb({
        insertMany: vi.fn().mockRejectedValue(error),
      });

      await expect(
        new MongoPurchasesRepository(db).insertMany([purchaseOf()]),
      ).rejects.toBe(error);
    });

    test("rethrows a bulk error with no write errors, such as a write concern failure", async () => {
      const error = bulkWriteError(1, []);
      const { db } = fakeDb({
        insertMany: vi.fn().mockRejectedValue(error),
      });

      await expect(
        new MongoPurchasesRepository(db).insertMany([purchaseOf()]),
      ).rejects.toBe(error);
    });

    test("rethrows a non-duplicate error", async () => {
      const error = new Error("connection closed");
      const { db } = fakeDb({
        insertMany: vi.fn().mockRejectedValue(error),
      });

      await expect(
        new MongoPurchasesRepository(db).insertMany([purchaseOf()]),
      ).rejects.toBe(error);
    });
  });
});

describe("MongoPurchasesRepository.countBySaleId", () => {
  test("counts the purchases of the sale", async () => {
    const countDocuments = vi.fn().mockResolvedValue(42);
    const { db } = fakeDb({ countDocuments });

    const count = await new MongoPurchasesRepository(db).countBySaleId(SALE_ID);

    expect(count).toBe(42);
    expect(countDocuments).toHaveBeenCalledExactlyOnceWith({ saleId: SALE_ID });
  });

  test("propagates database errors", async () => {
    const { db } = fakeDb({
      countDocuments: vi.fn().mockRejectedValue(new Error("db error")),
    });

    await expect(
      new MongoPurchasesRepository(db).countBySaleId(SALE_ID),
    ).rejects.toThrow("db error");
  });
});

describe("ensurePurchaseIndexes", () => {
  test("creates a unique {saleId, userId} index on the purchases collection", async () => {
    const createIndex = vi.fn().mockResolvedValue("saleId_1_userId_1");
    const { db, collection } = fakeDb({ createIndex });

    await ensurePurchaseIndexes(db);

    expect(collection).toHaveBeenCalledWith("purchases");
    expect(createIndex).toHaveBeenCalledWith(
      { saleId: 1, userId: 1 },
      { unique: true },
      undefined,
    );
  });
});
