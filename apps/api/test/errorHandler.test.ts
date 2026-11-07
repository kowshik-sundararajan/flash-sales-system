import { describe, expect, test, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type { PurchasesService } from "../src/services/purchases.service.js";
import type { SalesService } from "../src/services/sales.service.js";

const SALE_ID = "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f";

function appWith(
  overrides: {
    getStatus?: SalesService["getStatus"];
    purchase?: PurchasesService["purchase"];
  } = {},
) {
  return buildApp({
    salesService: { getStatus: overrides.getStatus ?? vi.fn() },
    purchasesService: { purchase: overrides.purchase ?? vi.fn() },
  });
}

describe("global error handler", () => {
  test("unexpected error becomes a generic 500 that leaks nothing", async () => {
    const secret = "mongodb://user:pw@internal-host:27017";
    const app = appWith({
      getStatus: vi.fn().mockRejectedValue(new Error(`down: ${secret}`)),
    });

    const res = await app.inject(`/api/sales/${SALE_ID}`);

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "internal_error" });
    expect(res.body).not.toContain(secret);
  });

  test("applies to the purchase routes too", async () => {
    const app = appWith({
      purchase: vi.fn().mockRejectedValue(new Error("secret detail")),
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/sales/${SALE_ID}/purchases`,
      payload: { userId: "6b1f6f0e-3c1a-4a43-8f55-0d6c1b2a9e10" },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "internal_error" });
  });

  test("a 5xx error carrying its own statusCode is still hidden", async () => {
    const err = Object.assign(new Error("upstream detail"), {
      statusCode: 502,
    });
    const app = appWith({ getStatus: vi.fn().mockRejectedValue(err) });

    const res = await app.inject(`/api/sales/${SALE_ID}`);

    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("upstream detail");
  });

  test("logs the original error server-side", async () => {
    const logged: unknown[] = [];
    const app = buildApp(
      {
        salesService: {
          getStatus: vi.fn().mockRejectedValue(new Error("mongo down")),
        },
        purchasesService: { purchase: vi.fn() },
      },
      {
        logger: {
          level: "error",
          stream: { write: (line: string) => logged.push(JSON.parse(line)) },
        },
      },
    );

    await app.inject(`/api/sales/${SALE_ID}`);

    expect(JSON.stringify(logged)).toContain("mongo down");
  });

  test("client errors keep their 4xx status and message (malformed JSON)", async () => {
    const purchase = vi.fn();
    const app = appWith({ purchase });

    const res = await app.inject({
      method: "POST",
      url: `/api/sales/${SALE_ID}/purchases`,
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: "FST_ERR_CTP_INVALID_JSON_BODY",
      message: expect.any(String),
    });
    expect(purchase).not.toHaveBeenCalled();
  });

  test("route-level 404 and 400 responses are not affected", async () => {
    const app = appWith();

    const res = await app.inject("/api/sales/not-a-uuid");

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_request");
  });
});
