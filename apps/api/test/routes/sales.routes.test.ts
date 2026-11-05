import { describe, expect, test, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import { SaleStatus } from "../../src/models/sale.model.js";
import {
  SaleNotFoundError,
  type SalesService,
} from "../../src/services/sales.service.js";

const result = {
  saleId: "sale-1",
  status: SaleStatus.ACTIVE,
  startsAt: 1_000,
  endsAt: 2_000,
  product: { id: "p1", name: "Best Headphones" },
};

function appWith(getStatus: SalesService["getStatus"]) {
  return buildApp({ salesService: { getStatus } });
}

describe("GET /api/sales/:saleId", () => {
  test("returns the status plus serverTime", async () => {
    const getStatus = vi.fn().mockResolvedValue(result);

    const res = await appWith(getStatus).inject("/api/sales/sale-1");

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ...result, serverTime: expect.any(Number) });
  });

  test("passes the same time reading to the service and the response", async () => {
    const getStatus = vi.fn().mockResolvedValue(result);

    const res = await appWith(getStatus).inject("/api/sales/sale-1");

    expect(getStatus).toHaveBeenCalledWith("sale-1", res.json().serverTime);
  });

  test("404 when the sale does not exist", async () => {
    const getStatus = vi.fn().mockRejectedValue(new SaleNotFoundError("nope"));

    const res = await appWith(getStatus).inject("/api/sales/nope");

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "sale_not_found" });
  });

  test("500 on an unexpected error, not 404", async () => {
    const getStatus = vi.fn().mockRejectedValue(new Error("mongo down"));

    const res = await appWith(getStatus).inject("/api/sales/sale-1");

    expect(res.statusCode).toBe(500);
  });

  test("400 for an over-long id, without calling the service", async () => {
    const getStatus = vi.fn();

    const res = await appWith(getStatus).inject(`/api/sales/${"x".repeat(65)}`);

    expect(res.statusCode).toBe(400);
    expect(getStatus).not.toHaveBeenCalled();
  });
});
