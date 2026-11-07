// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { SaleCard } from "./SaleCard";
import type { SaleStatus, SaleStatusResponse } from "../types/sale";

const SALE: SaleStatusResponse = {
  saleId: "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f",
  status: "active",
  startsAt: 1_000,
  endsAt: 2_000,
  serverTime: 1_500,
  stock: 7,
  product: { id: "p1", name: "Best Headphones" },
};

afterEach(cleanup);

test("shows the product name and remaining stock while active", () => {
  const { container } = render(<SaleCard sale={SALE} />);

  expect(container.textContent).toContain("Best Headphones");
  expect(container.textContent).toContain("Stock: 7");
});

test.each<SaleStatus>(["upcoming", "sold_out", "ended"])(
  "hides stock when the sale is %s",
  (status) => {
    const { container } = render(<SaleCard sale={{ ...SALE, status }} />);

    expect(container.textContent).not.toContain("Stock:");
  },
);
