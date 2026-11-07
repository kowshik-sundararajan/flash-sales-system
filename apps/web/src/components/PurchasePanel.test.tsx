// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PurchasePanel } from "./PurchasePanel";
import type { SaleStatus } from "../types/sale";

vi.mock("../hooks/useUserId", () => ({
  useUserId: () => ({ userId: "2b7e4a90-6c1d-4f38-8a5e-9d0c3b1f7e42" }),
}));

const SALE_ID = "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f";

afterEach(cleanup);

function buyButton(status: SaleStatus) {
  render(<PurchasePanel saleId={SALE_ID} status={status} />);
  return screen.getByRole<HTMLButtonElement>("button", { name: "Buy now" });
}

test("the buy button is enabled while the sale is active", () => {
  expect(buyButton("active").disabled).toBe(false);
});

test.each<SaleStatus>(["upcoming", "sold_out", "ended"])(
  "the buy button is disabled when the sale is %s",
  (status) => {
    expect(buyButton(status).disabled).toBe(true);
  },
);
