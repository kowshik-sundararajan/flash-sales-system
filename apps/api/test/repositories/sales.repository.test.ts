import { describe, expect, test, vi } from "vitest";
import { makeSaleDocument, SALE_ID } from "../fixtures.js";
import { fakeDb } from "../helper.js";
import { MongoSalesRepository } from "../../src/repositories/sales.repository.js";

describe("SalesRepository", () => {
  test("uses the sales collection", () => {
    const { db, collection } = fakeDb();

    new MongoSalesRepository(db);

    expect(collection).toHaveBeenCalledWith("sales");
  });

  describe("findById", () => {
    test("queries by _id and maps the document to a Sale", async () => {
      const { _id, ...fields } = makeSaleDocument();
      const findOne = vi.fn().mockResolvedValue({ _id, ...fields });
      const { db } = fakeDb({ findOne });

      const sale = await new MongoSalesRepository(db).findById(_id);

      expect(findOne).toHaveBeenCalledWith({ _id });
      expect(sale).toStrictEqual({ id: _id, ...fields });
    });

    test("maps both the initial and remaining stock", async () => {
      const doc = makeSaleDocument({ stock: { initial: 100, remaining: 40 } });
      const { db } = fakeDb({ findOne: vi.fn().mockResolvedValue(doc) });

      const sale = await new MongoSalesRepository(db).findById(doc._id);

      expect(sale?.stock).toStrictEqual({ initial: 100, remaining: 40 });
    });

    test("returns null when no document is found", async () => {
      const { db } = fakeDb({ findOne: vi.fn().mockResolvedValue(null) });

      await expect(
        new MongoSalesRepository(db).findById("uuid-does-not-exist"),
      ).resolves.toBeNull();
    });

    test("propagates database errors", async () => {
      const { db } = fakeDb({
        findOne: vi.fn().mockRejectedValue(new Error("db error")),
      });

      await expect(
        new MongoSalesRepository(db).findById("uuid-with-error"),
      ).rejects.toThrow("db error");
    });
  });

  describe("findById cache", () => {
    const TTL_MS = 1_000;
    const OTHER_SALE_ID = "11111111-2222-4333-8444-555555555555";

    function cachedRepo(
      findOne: ReturnType<typeof vi.fn>,
      options: { maxItems?: number } = {},
    ) {
      let now = 0;
      const { db } = fakeDb({ findOne });
      const repository = new MongoSalesRepository(db, {
        ttl: TTL_MS,
        now: () => now,
        ...options,
      });
      return {
        repository,
        advance: (ms: number) => {
          now += ms;
        },
      };
    }

    test("a second call within the TTL does not reach Mongo", async () => {
      const findOne = vi.fn().mockResolvedValue(makeSaleDocument());
      const { repository, advance } = cachedRepo(findOne);

      await repository.findById(SALE_ID);
      advance(TTL_MS - 1);
      await repository.findById(SALE_ID);

      expect(findOne).toHaveBeenCalledTimes(1);
    });

    test("after the TTL it reads Mongo again and returns the new value", async () => {
      const findOne = vi
        .fn()
        .mockResolvedValueOnce(makeSaleDocument())
        .mockResolvedValueOnce(
          makeSaleDocument({ stock: { initial: 10, remaining: 3 } }),
        );
      const { repository, advance } = cachedRepo(findOne);

      await repository.findById(SALE_ID);
      advance(TTL_MS);
      const sale = await repository.findById(SALE_ID);

      expect(findOne).toHaveBeenCalledTimes(2);
      expect(sale?.stock.remaining).toBe(3);
    });

    test("a missing sale is not cached", async () => {
      const findOne = vi.fn().mockResolvedValue(null);
      const { repository } = cachedRepo(findOne);

      await repository.findById(SALE_ID);
      await repository.findById(SALE_ID);

      expect(findOne).toHaveBeenCalledTimes(2);
    });

    test("an error is not cached: the next call retries", async () => {
      const findOne = vi
        .fn()
        .mockRejectedValueOnce(new Error("mongo down"))
        .mockResolvedValueOnce(makeSaleDocument());
      const { repository } = cachedRepo(findOne);

      await expect(repository.findById(SALE_ID)).rejects.toThrow("mongo down");
      const retry = await repository.findById(SALE_ID);

      expect(findOne).toHaveBeenCalledTimes(2);
      expect(retry?.id).toBe(SALE_ID);
    });

    test("past the size limit the oldest sale is evicted", async () => {
      const findOne = vi.fn(async ({ _id }: { _id: string }) =>
        makeSaleDocument({ _id }),
      );
      const { repository } = cachedRepo(findOne, { maxItems: 2 });

      await repository.findById("sale-1");
      await repository.findById("sale-2");
      await repository.findById("sale-3");
      findOne.mockClear();
      await repository.findById("sale-2");
      await repository.findById("sale-3");
      await repository.findById("sale-1");

      expect(findOne).toHaveBeenCalledTimes(1);
      expect(findOne).toHaveBeenCalledWith({ _id: "sale-1" });
    });

    test("different sales are cached separately", async () => {
      const findOne = vi.fn(async ({ _id }: { _id: string }) =>
        makeSaleDocument({ _id }),
      );
      const { repository } = cachedRepo(findOne);

      const first = await repository.findById(SALE_ID);
      const second = await repository.findById(OTHER_SALE_ID);
      await repository.findById(SALE_ID);
      await repository.findById(OTHER_SALE_ID);

      expect(findOne).toHaveBeenCalledTimes(2);
      expect(first?.id).toBe(SALE_ID);
      expect(second?.id).toBe(OTHER_SALE_ID);
    });
  });

  describe("setRemainingStockFromPurchaseCount", () => {
    test("updates the sale by _id", async () => {
      const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
      const { db } = fakeDb({ updateOne });

      await new MongoSalesRepository(db).setRemainingStockFromPurchaseCount(
        SALE_ID,
        3,
      );

      expect(updateOne).toHaveBeenCalledOnce();
      expect(updateOne.mock.calls[0]![0]).toStrictEqual({ _id: SALE_ID });
    });

    test.each([0, 7, 100])(
      "sets remaining to initial minus %i, never below 0 and never above what it already is, in one atomic pipeline update",
      async (count) => {
        const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
        const { db } = fakeDb({ updateOne });

        await new MongoSalesRepository(db).setRemainingStockFromPurchaseCount(
          SALE_ID,
          count,
        );

        expect(updateOne.mock.calls[0]![1]).toStrictEqual([
          {
            $set: {
              "stock.remaining": {
                $min: [
                  "$stock.remaining",
                  { $max: [0, { $subtract: ["$stock.initial", count] }] },
                ],
              },
            },
          },
        ]);
      },
    );

    test("resolves with nothing", async () => {
      const { db } = fakeDb({
        updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      });

      await expect(
        new MongoSalesRepository(db).setRemainingStockFromPurchaseCount(
          SALE_ID,
          3,
        ),
      ).resolves.toBeUndefined();
    });

    test("propagates database errors", async () => {
      const { db } = fakeDb({
        updateOne: vi.fn().mockRejectedValue(new Error("db error")),
      });

      await expect(
        new MongoSalesRepository(db).setRemainingStockFromPurchaseCount(
          SALE_ID,
          3,
        ),
      ).rejects.toThrow("db error");
    });
  });
});
