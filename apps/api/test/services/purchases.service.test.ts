import { describe, expect, test, vi } from "vitest";
import {
  PURCHASE_CODE,
  type PurchaseCode,
} from "../../src/models/purchase.model.js";
import type { PurchasesRepository } from "../../src/repositories/purchase.repository.js";
import { saleIdSchema } from "../../src/schemas/sale.schema.js";
import { userIdSchema } from "../../src/schemas/userId.schema.js";
import {
  PurchaseFailedError,
  PurchaseLookupFailedError,
  PurchasesService,
} from "../../src/services/purchases.service.js";

const SALE_ID = saleIdSchema.parse("8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f");
const USER_ID = userIdSchema.parse("johndoe30");

function serviceWithRepo(
  purchase: PurchasesRepository["purchase"],
  getPurchasedAt: PurchasesRepository["getPurchasedAt"] = vi.fn(),
) {
  return new PurchasesService({ purchase, getPurchasedAt });
}

describe("purchase", () => {
  test.each<{ scenario: string; repoReturns: PurchaseCode }>([
    {
      scenario: "user buys while stock remains",
      repoReturns: PURCHASE_CODE.PURCHASED,
    },
    {
      scenario: "user tries to buy a second time",
      repoReturns: PURCHASE_CODE.ALREADY_PURCHASED,
    },
    {
      scenario: "user buys after the stock is gone",
      repoReturns: PURCHASE_CODE.SOLD_OUT,
    },
    {
      scenario: "user buys before the sale starts",
      repoReturns: PURCHASE_CODE.NOT_STARTED,
    },
    {
      scenario: "user buys after the sale has ended",
      repoReturns: PURCHASE_CODE.ENDED,
    },
    {
      scenario: "sale has not been configured",
      repoReturns: PURCHASE_CODE.NOT_CONFIGURED,
    },
  ])("$scenario -> { code: $repoReturns }", async ({ repoReturns }) => {
    const purchase = vi.fn().mockResolvedValue(repoReturns);

    const result = await serviceWithRepo(purchase).purchase(SALE_ID, USER_ID);

    expect(result).toStrictEqual({ code: repoReturns });
    expect(purchase).toHaveBeenCalledWith(SALE_ID, USER_ID);
  });

  test("throws PurchaseFailedError if repository fails", async () => {
    const cause = new Error("redis down");
    const mockPurchaseRepository = vi.fn().mockRejectedValue(cause);

    const result = serviceWithRepo(mockPurchaseRepository).purchase(
      SALE_ID,
      USER_ID,
    );

    await expect(result).rejects.toBeInstanceOf(PurchaseFailedError);
    await expect(result).rejects.toThrow(
      `purchase failed for sale: ${SALE_ID} and user: ${USER_ID}`,
    );
    await expect(result).rejects.toMatchObject({ cause });
  });
});

describe("getPurchase", () => {
  const PURCHASED_AT = 1_700_000_000_000;

  test("returns { purchasedAt } when the user has a purchase", async () => {
    const getPurchasedAt = vi.fn().mockResolvedValue(PURCHASED_AT);

    const result = await serviceWithRepo(vi.fn(), getPurchasedAt).getPurchase(
      SALE_ID,
      USER_ID,
    );

    expect(result).toStrictEqual({ purchasedAt: PURCHASED_AT });
    expect(getPurchasedAt).toHaveBeenCalledWith(SALE_ID, USER_ID);
  });

  test("returns null when the user has no purchase", async () => {
    const getPurchasedAt = vi.fn().mockResolvedValue(null);

    const result = await serviceWithRepo(vi.fn(), getPurchasedAt).getPurchase(
      SALE_ID,
      USER_ID,
    );

    expect(result).toBeNull();
  });

  test("throws PurchaseLookupFailedError if repository fails", async () => {
    const cause = new Error("redis down");
    const getPurchasedAt = vi.fn().mockRejectedValue(cause);

    const result = serviceWithRepo(vi.fn(), getPurchasedAt).getPurchase(
      SALE_ID,
      USER_ID,
    );

    await expect(result).rejects.toBeInstanceOf(PurchaseLookupFailedError);
    await expect(result).rejects.toThrow(
      `purchase lookup failed for sale: ${SALE_ID} and user: ${USER_ID}`,
    );
    await expect(result).rejects.toMatchObject({ cause });
  });
});
