import type { Sale, Stock } from "../src/models/sale.model.js";
import { saleIdSchema } from "../src/schemas/sale.schema.js";
import { userIdSchema } from "../src/schemas/userId.schema.js";

export const SALE_ID = saleIdSchema.parse(
  "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f",
);
export const USER_ID = userIdSchema.parse("johndoe30");
export const OTHER_USER_ID = userIdSchema.parse("janedoe30");

export const INITIAL_STOCK = 10;

export function makeStock(
  remaining = INITIAL_STOCK,
  initial = INITIAL_STOCK,
): Stock {
  return { initial, remaining };
}

export function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: SALE_ID,
    product: { id: "product-1", name: "Best Headphones" },
    stock: makeStock(),
    startsAt: 1_000,
    endsAt: 2_000,
    ...overrides,
  };
}

type WithMongoId<T extends { id: string }> = Omit<T, "id"> & { _id: string };

export function makeSaleDocument(
  overrides: Partial<WithMongoId<Sale>> = {},
): WithMongoId<Sale> {
  const { id, ...fields } = makeSale();
  return { _id: id, ...fields, ...overrides };
}
