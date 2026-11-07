import { describe, expect, test, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import { SaleStatus } from "../../src/models/sale.model.js";
import {
  SaleNotFoundError,
  type SalesService,
} from "../../src/services/sales.service.js";

const MISSING_SALE_ID = "11111111-2222-4333-8444-555555555555";
const SALE_ID = "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f";

const result = {
  saleId: "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f",
  status: SaleStatus.ACTIVE,
  startsAt: 1_000,
  endsAt: 2_000,
  stock: 10,
  product: { id: "p1", name: "Best Headphones" },
};

function appWith(getStatus: SalesService["getStatus"]) {
  return buildApp({
    salesService: { getStatus },
    purchasesService: { purchase: vi.fn(), getPurchase: vi.fn() },
  });
}

describe("GET /api/sales/:saleId", () => {
  test("returns the status plus serverTime", async () => {
    const getStatus = vi.fn().mockResolvedValue(result);

    const res = await appWith(getStatus).inject(`/api/sales/${SALE_ID}`);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ...result, serverTime: expect.any(Number) });
  });

  test("passes the same time reading to the service and the response", async () => {
    const getStatus = vi.fn().mockResolvedValue(result);

    const res = await appWith(getStatus).inject(
      "/api/sales/8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f",
    );

    expect(getStatus).toHaveBeenCalledWith(SALE_ID, res.json().serverTime);
  });

  test("404 when the sale does not exist", async () => {
    const getStatus = vi
      .fn()
      .mockRejectedValue(new SaleNotFoundError(MISSING_SALE_ID));

    const res = await appWith(getStatus).inject(
      `/api/sales/${MISSING_SALE_ID}`,
    );

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "sale_not_found" });
  });

  test("500 on an unexpected error, not 404", async () => {
    const getStatus = vi.fn().mockRejectedValue(new Error("mongo down"));

    const res = await appWith(getStatus).inject(`/api/sales/${SALE_ID}`);

    expect(res.statusCode).toBe(500);
  });

  test.each(["sale-1", "x".repeat(65), "not-a-uuid"])(
    "400 for a non-UUID id %s, without calling the service",
    async (id) => {
      const getStatus = vi.fn();

      const res = await appWith(getStatus).inject(`/api/sales/${id}`);

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("invalid_request");
      expect(getStatus).not.toHaveBeenCalled();
    },
  );

  test("normalizes an uppercase UUID to lowercase", async () => {
    const getStatus = vi.fn().mockResolvedValue(result);

    await appWith(getStatus).inject(
      `/api/sales/${result.saleId.toUpperCase()}`,
    );

    expect(getStatus).toHaveBeenCalledWith(result.saleId, expect.any(Number));
  });
});
