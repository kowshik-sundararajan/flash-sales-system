import type { Sale } from "../src/models/sale.model.js";

type WithMongoId<T extends { id: string }> = Omit<T, "id"> & { _id: string };

export function makeSaleDocument(
  overrides: Partial<WithMongoId<Sale>> = {},
): WithMongoId<Sale> {
  return {
    _id: "sale-1",
    product: {
      id: "product-1",
      name: "Best Headphones",
    },
    stock: 100,
    perUserLimit: 2,
    startsAt: 1_700_000_000_000,
    endsAt: 1_700_003_600_000,
    ...overrides,
  };
}
