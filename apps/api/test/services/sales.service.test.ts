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

    test.each([
      {
        name: "returns upcoming when current time is before sale startsAt",
        now: 999,
        expected: SaleStatus.UPCOMING,
      },
      {
        name: "returns active when current time equals sale startsAt (inclusive)",
        now: 1_000,
        expected: SaleStatus.ACTIVE,
      },
      {
        name: "returns active when current time is between sale startsAt and endsAt",
        now: 1_500,
        expected: SaleStatus.ACTIVE,
      },
      {
        name: "returns active when current time is just before sale endsAt",
        now: 1_999,
        expected: SaleStatus.ACTIVE,
      },
      {
        name: "returns ended when current time equals sale endsAt (exclusive)",
        now: 2_000,
        expected: SaleStatus.ENDED,
      },
      {
        name: "returns ended when current time is after sale endsAt",
        now: 2_001,
        expected: SaleStatus.ENDED,
      },
    ])("$name", ({ now, expected }) => {
      expect(getSaleStatus(sale, now)).toBe(expected);
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
        product: { id: "product-1", name: "Best Headphones" },
      });
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
