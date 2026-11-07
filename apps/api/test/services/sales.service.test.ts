import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SaleStatus, type Sale } from "../../src/models/sale.model.js";
import type { SalesRepository } from "../../src/repositories/sales.repository.js";
import {
  getSaleStatus,
  SaleNotFoundError,
  SalesService,
} from "../../src/services/sales.service.js";

describe("SalesService", () => {
  describe("getSaleStatus", () => {
    const sale = { startsAt: 1_000, endsAt: 2_000 };
    const STOCK = 10;

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
        name: "returns sold_out when stock is negative",
        now: 1_500,
        stock: -1,
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
      {
        name: "returns ended after endsAt even when stock is 0",
        now: 2_001,
        stock: 0,
        expected: SaleStatus.ENDED,
      },
    ])("$name", ({ now, stock, expected }) => {
      expect(getSaleStatus(sale, now, stock)).toBe(expected);
    });
  });

  describe("getStatus", () => {
    const sale: Sale = {
      id: "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f",
      product: { id: "product-1", name: "Best Headphones" },
      stock: 10,
      startsAt: 1_000,
      endsAt: 2_000,
    };

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test("returns sale details and the status for the current time", async () => {
      vi.setSystemTime(1_500);
      const repo: SalesRepository = {
        findById: vi.fn().mockResolvedValue(sale),
      };

      const result = await new SalesService(repo).getStatus(
        "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f",
      );

      expect(repo.findById).toHaveBeenCalledWith(
        "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f",
      );
      expect(result).toEqual({
        saleId: "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f",
        status: SaleStatus.ACTIVE,
        startsAt: 1_000,
        endsAt: 2_000,
        stock: 10,
        product: { id: "product-1", name: "Best Headphones" },
      });
    });

    test("returns sold_out with stock 0 while the sale is running", async () => {
      vi.setSystemTime(1_500);
      const repo: SalesRepository = {
        findById: vi.fn().mockResolvedValue({ ...sale, stock: 0 }),
      };

      const result = await new SalesService(repo).getStatus(sale.id);

      expect(result.status).toBe(SaleStatus.SOLD_OUT);
      expect(result.stock).toBe(0);
    });

    test("throws SaleNotFoundError when the sale does not exist", async () => {
      const repo: SalesRepository = {
        findById: vi.fn().mockResolvedValue(null),
      };

      await expect(new SalesService(repo).getStatus("missing")).rejects.toThrow(
        SaleNotFoundError,
      );
    });

    test("propagates repository errors unchanged", async () => {
      const error = new Error("db down");
      const repo: SalesRepository = {
        findById: vi.fn().mockRejectedValue(error),
      };

      await expect(
        new SalesService(repo).getStatus(
          "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f",
        ),
      ).rejects.toBe(error);
    });
  });
});
