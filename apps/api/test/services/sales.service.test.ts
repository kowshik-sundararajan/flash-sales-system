import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MongoNetworkError } from "mongodb";
import { SaleStatus } from "../../src/models/sale.model.js";
import {
  MongoSalesRepository,
  type SalesRepository,
} from "../../src/repositories/sales.repository.js";
import { fakeDb } from "../helper.js";
import { makeSaleDocument } from "../fixtures.js";
import {
  getSaleStatus,
  SaleNotFoundError,
  SalesService,
} from "../../src/services/sales.service.js";
import { INITIAL_STOCK, makeSale, makeStock, SALE_ID } from "../fixtures.js";
import { ServiceUnavailableError } from "../../src/errors/errors.js";

function repoWith(findById: SalesRepository["findById"]): SalesRepository {
  return { findById, setRemainingStockFromPurchaseCount: vi.fn() };
}

describe("SalesService", () => {
  describe("getSaleStatus", () => {
    const sale = { startsAt: 1_000, endsAt: 2_000 };
    const STOCK = INITIAL_STOCK;

    test.each([
      {
        name: "returns upcoming when current time is before sale startsAt",
        now: 999,
        stock: STOCK,
        expected: SaleStatus.UPCOMING,
      },
      {
        name: "returns upcoming before startsAt even when there is no stock",
        now: 999,
        stock: 0,
        expected: SaleStatus.UPCOMING,
      },
      {
        name: "returns active when current time equals sale startsAt (inclusive)",
        now: 1_000,
        stock: STOCK,
        expected: SaleStatus.ACTIVE,
      },
      {
        name: "returns active when current time is between sale startsAt and endsAt",
        now: 1_500,
        stock: STOCK,
        expected: SaleStatus.ACTIVE,
      },
      {
        name: "returns active when current time is just before sale endsAt",
        now: 1_999,
        stock: STOCK,
        expected: SaleStatus.ACTIVE,
      },
      {
        name: "returns active when exactly one item is left",
        now: 1_500,
        stock: 1,
        expected: SaleStatus.ACTIVE,
      },
      {
        name: "returns sold_out when the sale is running and stock is 0",
        now: 1_500,
        stock: 0,
        expected: SaleStatus.SOLD_OUT,
      },
      {
        name: "returns ended when current time equals sale endsAt (exclusive)",
        now: 2_000,
        stock: STOCK,
        expected: SaleStatus.ENDED,
      },
      {
        name: "returns ended when current time is after sale endsAt",
        now: 2_001,
        stock: STOCK,
        expected: SaleStatus.ENDED,
      },
    ])("$name", ({ now, stock, expected }) => {
      expect(getSaleStatus(sale, now, makeStock(stock))).toBe(expected);
    });
  });

  describe("getStatus", () => {
    // The window is explicit because the fake timers below depend on it.
    const sale = makeSale({ startsAt: 1_000, endsAt: 2_000 });

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test("returns sale details and the status for the current time", async () => {
      vi.setSystemTime(1_500);
      const repo = repoWith(vi.fn().mockResolvedValue(sale));

      const result = await new SalesService(repo).getStatus(SALE_ID);

      expect(repo.findById).toHaveBeenCalledWith(SALE_ID);
      expect(result).toEqual({
        saleId: SALE_ID,
        status: SaleStatus.ACTIVE,
        startsAt: sale.startsAt,
        endsAt: sale.endsAt,
        stock: sale.stock,
        product: sale.product,
      });
    });

    test("returns sold_out with stock 0 while the sale is running", async () => {
      vi.setSystemTime(1_500);
      const repo = repoWith(
        vi.fn().mockResolvedValue({ ...sale, stock: makeStock(0) }),
      );

      const result = await new SalesService(repo).getStatus(sale.id);

      expect(result.status).toBe(SaleStatus.SOLD_OUT);
      expect(result.stock.remaining).toBe(0);
    });

    test("throws SaleNotFoundError when the sale does not exist", async () => {
      const repo = repoWith(vi.fn().mockResolvedValue(null));

      await expect(new SalesService(repo).getStatus("missing")).rejects.toThrow(
        SaleNotFoundError,
      );
    });

    test("a Mongo outage becomes SaleLookupFailedError, keeping the cause", async () => {
      const cause = new MongoNetworkError("db down");
      const repo = repoWith(vi.fn().mockRejectedValue(cause));

      const result = new SalesService(repo).getStatus(SALE_ID);

      await expect(result).rejects.toBeInstanceOf(ServiceUnavailableError);
      await expect(result).rejects.toMatchObject({ cause });
    });

    test("a failure that is not an outage stays what it is", async () => {
      const bug = new TypeError("cannot read properties of undefined");
      const repo = repoWith(vi.fn().mockRejectedValue(bug));

      await expect(new SalesService(repo).getStatus(SALE_ID)).rejects.toBe(bug);
    });
  });

  describe("with the sale served from the repository cache", () => {
    test("upcoming becomes active exactly at startsAt, without another Mongo read", async () => {
      const findOne = vi
        .fn()
        .mockResolvedValue(
          makeSaleDocument({ startsAt: 1_000, endsAt: 2_000 }),
        );
      const { db } = fakeDb({ findOne });
      const service = new SalesService(new MongoSalesRepository(db));

      const before = await service.getStatus(SALE_ID, 999);
      const at = await service.getStatus(SALE_ID, 1_000);

      expect(before.status).toBe(SaleStatus.UPCOMING);
      expect(at.status).toBe(SaleStatus.ACTIVE);
      expect(findOne).toHaveBeenCalledTimes(1);
    });
  });
});
