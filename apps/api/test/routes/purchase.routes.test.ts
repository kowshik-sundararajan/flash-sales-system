import { describe, expect, test, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import {
  PURCHASE_CODE,
  type Purchase,
  type PurchaseCode,
} from "../../src/models/purchase.model.js";
import {
  PurchaseFailedError,
  type PurchasesService,
} from "../../src/services/purchases.service.js";
import { SALE_ID, USER_ID } from "../fixtures.js";
import { ServiceUnavailableError } from "../../src/errors/errors.js";

const URL = `/api/sales/${SALE_ID}/purchases`;

function purchaseReturning(code: PurchaseCode) {
  return vi.fn<PurchasesService["purchase"]>().mockResolvedValue({ code });
}

function appWith(
  purchase: PurchasesService["purchase"],
  getPurchase: PurchasesService["getPurchase"] = vi.fn(),
) {
  return buildApp({
    salesService: { getStatus: vi.fn() },
    purchasesService: { purchase, getPurchase },
    checkDependencies: async () => {},
  });
}

function post(
  purchase: PurchasesService["purchase"],
  payload?: unknown,
  url = URL,
) {
  return appWith(purchase).inject({
    method: "POST",
    url,
    payload: payload as object,
  });
}

describe("POST /api/sales/:saleId/purchases", () => {
  describe("status codes", () => {
    test("201 with the code when the purchase succeeds", async () => {
      const res = await post(purchaseReturning(PURCHASE_CODE.PURCHASED), {
        userId: USER_ID,
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ code: PURCHASE_CODE.PURCHASED });
    });

    test.each([
      { code: PURCHASE_CODE.ALREADY_PURCHASED, status: 409 },
      { code: PURCHASE_CODE.SOLD_OUT, status: 409 },
      { code: PURCHASE_CODE.NOT_STARTED, status: 409 },
      { code: PURCHASE_CODE.ENDED, status: 409 },
      { code: PURCHASE_CODE.NOT_CONFIGURED, status: 503 },
    ])("$status with code $code", async ({ code, status }) => {
      const res = await post(purchaseReturning(code), { userId: USER_ID });

      expect(res.statusCode).toBe(status);
      expect(res.json()).toEqual({ code });
    });

    test("the table above covers every purchase code", () => {
      const covered = [
        PURCHASE_CODE.PURCHASED,
        PURCHASE_CODE.ALREADY_PURCHASED,
        PURCHASE_CODE.SOLD_OUT,
        PURCHASE_CODE.NOT_STARTED,
        PURCHASE_CODE.ENDED,
        PURCHASE_CODE.NOT_CONFIGURED,
      ];

      expect([...covered].sort()).toEqual(Object.values(PURCHASE_CODE).sort());
    });
  });

  describe("input handling", () => {
    test("passes the sale id and user id to the service", async () => {
      const purchase = purchaseReturning(PURCHASE_CODE.PURCHASED);

      await post(purchase, { userId: USER_ID });

      expect(purchase).toHaveBeenCalledOnce();
      expect(purchase).toHaveBeenCalledWith(SALE_ID, USER_ID);
    });

    test("normalizes both ids (trim and lowercase) before calling the service", async () => {
      const purchase = purchaseReturning(PURCHASE_CODE.PURCHASED);

      await post(
        purchase,
        { userId: `  ${USER_ID.toUpperCase()}  ` },
        `/api/sales/${SALE_ID.toUpperCase()}/purchases`,
      );

      expect(purchase).toHaveBeenCalledWith(SALE_ID, USER_ID);
    });

    test("400 for a non-UUID sale id, without calling the service", async () => {
      const purchase = purchaseReturning(PURCHASE_CODE.PURCHASED);

      const res = await post(
        purchase,
        { userId: USER_ID },
        "/api/sales/sale-1/purchases",
      );

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("invalid_request");
      expect(purchase).not.toHaveBeenCalled();
    });

    test.each([
      { name: "a missing body", body: undefined },
      { name: "an empty object", body: {} },
      { name: "a missing userId", body: { other: 1 } },
      { name: "a too-short userId", body: { userId: "bo" } },
      { name: "a non-string userId", body: { userId: 123 } },
      { name: "a null userId", body: { userId: null } },
      { name: "an unknown extra field", body: { userId: USER_ID, extra: 1 } },
    ])("400 for $name, without calling the service", async ({ body }) => {
      const purchase = purchaseReturning(PURCHASE_CODE.PURCHASED);

      const res = await post(purchase, body);

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("invalid_request");
      expect(purchase).not.toHaveBeenCalled();
    });
  });

  describe("failures", () => {
    test("503 with Retry-After and a generic body when Redis fails, leaking nothing", async () => {
      const purchase = vi.fn<PurchasesService["purchase"]>().mockRejectedValue(
        new PurchaseFailedError(SALE_ID, USER_ID, {
          cause: new Error("redis://user:pw@internal-host"),
        }),
      );

      const res = await post(purchase, { userId: USER_ID });

      expect(res.statusCode).toBe(503);
      expect(res.headers["retry-after"]).toBe("1");
      expect(res.json()).toEqual({ error: "temporarily_unavailable" });
      expect(res.body).not.toContain("internal-host");
      expect(res.body).not.toContain(USER_ID);
    });
  });
});

describe("GET /api/sales/:saleId/purchases/:userId", () => {
  const PURCHASED_AT = 1_700_000_000_000;
  const GET_URL = `${URL}/${USER_ID}`;

  function getPurchaseReturning(
    purchase: Pick<Purchase, "purchasedAt"> | null,
  ) {
    return vi.fn<PurchasesService["getPurchase"]>().mockResolvedValue(purchase);
  }

  function get(getPurchase: PurchasesService["getPurchase"], url = GET_URL) {
    return appWith(vi.fn(), getPurchase).inject({ method: "GET", url });
  }

  test("200 with purchasedAt when the user has purchased", async () => {
    const res = await get(getPurchaseReturning({ purchasedAt: PURCHASED_AT }));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ purchasedAt: PURCHASED_AT });
  });

  test("404 when the user has not purchased", async () => {
    const res = await get(getPurchaseReturning(null));

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "purchase_not_found" });
  });

  test("passes the sale id and user id to the service", async () => {
    const getPurchase = getPurchaseReturning(null);

    await get(getPurchase);

    expect(getPurchase).toHaveBeenCalledOnce();
    expect(getPurchase).toHaveBeenCalledWith(SALE_ID, USER_ID);
  });

  test("normalizes both ids (trim and lowercase) like the POST route", async () => {
    const getPurchase = getPurchaseReturning(null);

    await get(
      getPurchase,
      `/api/sales/${SALE_ID.toUpperCase()}/purchases/${USER_ID.toUpperCase()}`,
    );

    expect(getPurchase).toHaveBeenCalledWith(SALE_ID, USER_ID);
  });

  test.each([
    {
      name: "a non-UUID sale id",
      url: `/api/sales/sale-1/purchases/${USER_ID}`,
    },
    { name: "a too-short user id", url: `${URL}/bo` },
    { name: "a user id with invalid characters", url: `${URL}/john_doe` },
    { name: "a too-long user id", url: `${URL}/${"a".repeat(33)}` },
  ])("400 for $name, without calling the service", async ({ url }) => {
    const getPurchase = getPurchaseReturning(null);

    const res = await get(getPurchase, url);

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_request");
    expect(getPurchase).not.toHaveBeenCalled();
  });

  test("503 with Retry-After and a generic body when Redis fails, leaking nothing", async () => {
    const getPurchase = vi
      .fn<PurchasesService["getPurchase"]>()
      .mockRejectedValue(
        new ServiceUnavailableError(
          `purchase lookup failed for sale: ${SALE_ID} and user: ${USER_ID}`,
          {
            cause: new Error("redis://user:pw@internal-host"),
          },
        ),
      );

    const res = await get(getPurchase);

    expect(res.statusCode).toBe(503);
    expect(res.headers["retry-after"]).toBe("1");
    expect(res.json()).toEqual({ error: "temporarily_unavailable" });
    expect(res.body).not.toContain("internal-host");
    expect(res.body).not.toContain(USER_ID);
  });
});
