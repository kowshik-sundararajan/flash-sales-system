// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { SaleCard } from "./SaleCard";
import type { SaleStatus, SaleStatusResponse } from "../types/sale";

const SALE: SaleStatusResponse = {
  saleId: "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f",
  status: "active",
  startsAt: 1_000,
  endsAt: 2_000,
  serverTime: 1_500,
  stock: { initial: 10, remaining: 7 },
  product: { id: "p1", name: "Best Headphones" },
};

afterEach(cleanup);

test("shows the product name as the card heading", () => {
  render(<SaleCard sale={SALE} />);

  expect(screen.getByRole("heading", { name: "Best Headphones" })).toBeTruthy();
});

test.each<[SaleStatus, string]>([
  ["upcoming", "Coming soon"],
  ["active", "Live now"],
  ["sold_out", "Sold out"],
  ["ended", "Ended"],
])("a %s sale shows the %s pill", (status, label) => {
  render(<SaleCard sale={{ ...SALE, status }} />);

  expect(screen.getByText(label, { selector: ".pill" })).toBeTruthy();
});

test("the stock bar shows remaining and initial stock", () => {
  const { container } = render(<SaleCard sale={SALE} />);

  expect(container.textContent).toContain("7 left");
  expect(container.textContent).toContain("of 10");
  expect(container.querySelector(".bar-fill")!.getAttribute("style")).toContain(
    "70%",
  );
});

test("a sold out sale shows an empty bar", () => {
  const { container } = render(
    <SaleCard
      sale={{
        ...SALE,
        status: "sold_out",
        stock: { initial: 10, remaining: 0 },
      }}
    />,
  );

  expect(container.textContent).toContain("None left");
  expect(container.querySelector(".bar-fill")!.getAttribute("style")).toContain(
    "0%",
  );
});

test("an ended sale hides the stock bar", () => {
  const { container } = render(
    <SaleCard sale={{ ...SALE, status: "ended" }} />,
  );

  expect(container.querySelector(".stock")).toBeNull();
});

test("an upcoming sale still shows the stock on offer", () => {
  const { container } = render(
    <SaleCard
      sale={{
        ...SALE,
        status: "upcoming",
        stock: { initial: 10, remaining: 10 },
      }}
    />,
  );

  expect(container.querySelector(".stock")).not.toBeNull();
});
