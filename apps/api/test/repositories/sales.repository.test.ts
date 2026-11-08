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
