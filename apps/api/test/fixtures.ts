import type { Sale } from "../src/models/sale.model.js";

type WithMongoId<T extends { id: string }> = Omit<T, "id"> & { _id: string };

export function makeSaleDocument(
  overrides: Partial<WithMongoId<Sale>> = {},
): WithMongoId<Sale> {
  return {
    _id: "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f",
    product: {
      id: "product-1",
      name: "Best Headphones",
    },
    stock: 100,
    startsAt: 1_700_000_000_000,
    endsAt: 1_700_003_600_000,
    ...overrides,
  };
}
