import { describe, expect, test, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import {
  PURCHASE_CODE,
  type PurchaseCode,
} from "../../src/models/purchase.model.js";
import { saleIdSchema } from "../../src/schemas/sale.schema.js";
import { userIdSchema } from "../../src/schemas/userId.schema.js";
import {
  PurchaseFailedError,
  type PurchasesService,
} from "../../src/services/purchases.service.js";

const SALE_ID = "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f";
const USER_ID = "johndoe30";
const URL = `/api/sales/${SALE_ID}/purchases`;

function purchaseReturning(code: PurchaseCode) {
  return vi.fn<PurchasesService["purchase"]>().mockResolvedValue({ code });
}

function appWith(purchase: PurchasesService["purchase"]) {
  return buildApp({
    salesService: { getStatus: vi.fn() },
    purchasesService: { purchase },
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
    test("500 with a generic body when the service fails, leaking nothing", async () => {
      const purchase = vi.fn<PurchasesService["purchase"]>().mockRejectedValue(
        new PurchaseFailedError(
          saleIdSchema.parse(SALE_ID),
          userIdSchema.parse(USER_ID),
          {
            cause: new Error("redis://user:pw@internal-host"),
          },
        ),
      );

      const res = await post(purchase, { userId: USER_ID });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "internal_error" });
      expect(res.body).not.toContain("internal-host");
      expect(res.body).not.toContain(USER_ID);
    });
  });
});
