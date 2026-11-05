import { describe, expect, test, vi } from "vitest";
import { makeSaleDocument } from "../fixtures.js";
import { fakeDb } from "../helper.js";
import { MongoSalesRepository } from "../../src/repositories/sales.repository.js";

describe("SalesRepository", () => {
  test("uses the sales collection", () => {
    const { db, collection } = fakeDb(vi.fn());

    new MongoSalesRepository(db);

    expect(collection).toHaveBeenCalledWith("sales");
  });

  describe("findById", () => {
    test("queries by _id and maps the document to a Sale", async () => {
      const { _id, ...fields } = makeSaleDocument();
      const findOne = vi.fn().mockResolvedValue({ _id, ...fields });
      const { db } = fakeDb(findOne);

      const sale = await new MongoSalesRepository(db).findById(_id);

      expect(findOne).toHaveBeenCalledWith({ _id });
      expect(sale).toStrictEqual({ id: _id, ...fields });
    });

    test("returns null when no document is found", async () => {
      const { db } = fakeDb(vi.fn().mockResolvedValue(null));

      await expect(
        new MongoSalesRepository(db).findById("uuid-does-not-exist"),
      ).resolves.toBeNull();
    });

    test("propagates database errors", async () => {
      const { db } = fakeDb(vi.fn().mockRejectedValue(new Error("db error")));

      await expect(
        new MongoSalesRepository(db).findById("uuid-with-error"),
      ).rejects.toThrow("db error");
    });
  });
});
