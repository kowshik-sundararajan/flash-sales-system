import { describe, expect, test } from "vitest";
import { purchaseStreamEntrySchema } from "../../src/schemas/purchase.schema.js";
import { SALE_ID, USER_ID } from "../fixtures.js";

const VALID = {
  saleId: SALE_ID,
  userId: USER_ID,
  purchasedAt: "1700000000123",
};

describe("purchaseStreamEntrySchema", () => {
  test("parses string fields into a purchase with a numeric time", () => {
    expect(purchaseStreamEntrySchema.parse(VALID)).toStrictEqual({
      saleId: SALE_ID,
      userId: USER_ID,
      purchasedAt: 1_700_000_000_123,
    });
  });

  test("normalizes the user id like the API does", () => {
    const parsed = purchaseStreamEntrySchema.parse({
      ...VALID,
      userId: "  JohnDoe30 ",
    });

    expect(parsed.userId).toBe(USER_ID);
  });

  test("ignores fields it does not know, so new fields do not break the sync", () => {
    expect(
      purchaseStreamEntrySchema.safeParse({ ...VALID, source: "web" }).success,
    ).toBe(true);
  });

  test.each([
    { name: "no saleId", entry: { ...VALID, saleId: undefined } },
    { name: "a non-UUID saleId", entry: { ...VALID, saleId: "sale-1" } },
    { name: "no userId", entry: { ...VALID, userId: undefined } },
    { name: "an invalid userId", entry: { ...VALID, userId: "no good!" } },
    { name: "no purchasedAt", entry: { ...VALID, purchasedAt: undefined } },
    {
      name: "a non-numeric purchasedAt",
      entry: { ...VALID, purchasedAt: "soon" },
    },
    {
      name: "a fractional purchasedAt",
      entry: { ...VALID, purchasedAt: "1.5" },
    },
    { name: "a zero purchasedAt", entry: { ...VALID, purchasedAt: "0" } },
    { name: "an empty purchasedAt", entry: { ...VALID, purchasedAt: "" } },
  ])("rejects $name", ({ entry }) => {
    expect(purchaseStreamEntrySchema.safeParse(entry).success).toBe(false);
  });
});
