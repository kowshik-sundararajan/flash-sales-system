// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PurchasePanel } from "./PurchasePanel";
import { postPurchase } from "../lib/purchase/purchase";
import { PURCHASE_CODE } from "../types/purchase";
import type { SaleStatus } from "../types/sale";

vi.mock("../lib/purchase/purchase");

const SALE_ID = "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f";
const USERNAME = "johndoe30";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function setup(status: SaleStatus = "active") {
  render(<PurchasePanel saleId={SALE_ID} status={status} />);
  const input = screen.getByLabelText<HTMLInputElement>("Username");
  const button = screen.getByRole<HTMLButtonElement>("button");
  const type = (value: string) =>
    fireEvent.change(input, { target: { value } });
  return { input, button, type };
}

test("the buy button is disabled until a valid username is typed", () => {
  const { button, type } = setup();
  expect(button.disabled).toBe(true);

  type("ko");
  expect(button.disabled).toBe(true);

  type(USERNAME);
  expect(button.disabled).toBe(false);
});

test("shows a hint for an invalid username, and none when empty or valid", () => {
  const { type } = setup();
  expect(screen.queryByText("Use 3 to 32 letters and digits")).toBeNull();

  type("kow 42");
  expect(screen.getByText("Use 3 to 32 letters and digits")).toBeTruthy();

  type(USERNAME);
  expect(screen.queryByText("Use 3 to 32 letters and digits")).toBeNull();
});

test.each<SaleStatus>(["upcoming", "sold_out", "ended"])(
  "the buy button stays disabled when the sale is %s",
  (status) => {
    const { button, type } = setup(status);
    type(USERNAME);

    expect(button.disabled).toBe(true);
  },
);

test("buying posts the trimmed username and shows the message", async () => {
  vi.mocked(postPurchase).mockResolvedValue({ code: PURCHASE_CODE.PURCHASED });
  const { button, type } = setup();
  type(`  ${USERNAME}  `);

  fireEvent.click(button);

  expect(await screen.findByText("You got it!")).toBeTruthy();
  expect(postPurchase).toHaveBeenCalledWith(SALE_ID, USERNAME);
});

test("shows a generic message when the request fails", async () => {
  vi.mocked(postPurchase).mockRejectedValue(new Error("purchase failed: 500"));
  const { button, type } = setup();
  type(USERNAME);

  fireEvent.click(button);

  await waitFor(() =>
    expect(
      screen.getByText("Something went wrong. Please try again."),
    ).toBeTruthy(),
  );
});
