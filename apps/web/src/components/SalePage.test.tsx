// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SalePage } from "./SalePage";
import { useSale } from "../hooks/useSale";
import type { SaleStatusResponse } from "../types/sale";

vi.mock("../hooks/useSale");

const SALE: SaleStatusResponse = {
  saleId: "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f",
  status: "active",
  startsAt: 1_000,
  endsAt: 2_000,
  serverTime: 1_500,
  stock: { initial: 10, remaining: 7 },
  product: { id: "p1", name: "Best Headphones" },
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

test("says it is loading until the first answer", () => {
  vi.mocked(useSale).mockReturnValue({ sale: undefined, failed: false });

  render(<SalePage />);

  expect(screen.getByText("Loading sale…")).toBeTruthy();
});

test("says so when the sale does not exist", () => {
  vi.mocked(useSale).mockReturnValue({ sale: null, failed: false });

  render(<SalePage />);

  expect(screen.getByText("No sale found")).toBeTruthy();
});

test("says it will retry when the first load fails", () => {
  vi.mocked(useSale).mockReturnValue({ sale: undefined, failed: true });

  render(<SalePage />);

  expect(screen.getByText("Can't load the sale")).toBeTruthy();
  expect(screen.getByText("Trying again automatically.")).toBeTruthy();
});

test("shows the sale card", () => {
  vi.mocked(useSale).mockReturnValue({ sale: SALE, failed: false });

  render(<SalePage />);

  expect(screen.getByRole("heading", { name: "Best Headphones" })).toBeTruthy();
});

test("keeps the last sale on screen when a later refresh fails", () => {
  vi.mocked(useSale).mockReturnValue({ sale: SALE, failed: true });

  render(<SalePage />);

  expect(screen.getByRole("heading", { name: "Best Headphones" })).toBeTruthy();
});

test("always shows the brand and the connection status", () => {
  vi.mocked(useSale).mockReturnValue({ sale: undefined, failed: false });

  render(<SalePage />);

  expect(screen.getByText("Flash sale")).toBeTruthy();
});
