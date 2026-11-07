// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PurchaseCheck } from "./PurchaseCheck";
import { getPurchase } from "../lib/purchase/purchase";

vi.mock("../lib/purchase/purchase");

const SALE_ID = "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f";
const USERNAME = "johndoe30";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function setup() {
  render(<PurchaseCheck saleId={SALE_ID} />);
  const input = screen.getByLabelText<HTMLInputElement>("Username to check");
  const button = screen.getByRole<HTMLButtonElement>("button");
  const type = (value: string) =>
    fireEvent.change(input, { target: { value } });
  return { input, button, type };
}

test("the check button is disabled until a valid username is typed", () => {
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

test("checks the trimmed username and says the user secured the item", async () => {
  vi.mocked(getPurchase).mockResolvedValue({ purchasedAt: 1_700_000_000_000 });
  const { button, type } = setup();
  type(`  ${USERNAME}  `);

  fireEvent.click(button);

  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe(
      "You secured this item.",
    ),
  );
  expect(getPurchase).toHaveBeenCalledWith(SALE_ID, USERNAME);
});

test("says no purchase was found when the user has not bought", async () => {
  vi.mocked(getPurchase).mockResolvedValue(null);
  const { button, type } = setup();
  type(USERNAME);

  fireEvent.click(button);

  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe(
      "No purchase found for this username.",
    ),
  );
});

test("shows an error message when the lookup fails", async () => {
  vi.mocked(getPurchase).mockRejectedValue(
    new Error("purchase lookup failed: 500"),
  );
  const { button, type } = setup();
  type(USERNAME);

  fireEvent.click(button);

  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe(
      "Something went wrong. Please try again.",
    ),
  );
});

test("submitting the form with Enter runs the check", async () => {
  vi.mocked(getPurchase).mockResolvedValue(null);
  const { input, type } = setup();
  type(USERNAME);

  fireEvent.submit(input.closest("form")!);

  await waitFor(() => expect(getPurchase).toHaveBeenCalledOnce());
});

test("does not call the API on submit with an invalid username", () => {
  const { input, type } = setup();
  type("ko");

  fireEvent.submit(input.closest("form")!);

  expect(getPurchase).not.toHaveBeenCalled();
});

test("clears the result when the username is edited", async () => {
  vi.mocked(getPurchase).mockResolvedValue({ purchasedAt: 1_700_000_000_000 });
  const { button, type } = setup();
  type(USERNAME);
  fireEvent.click(button);
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe(
      "You secured this item.",
    ),
  );

  type("someoneelse");

  expect(screen.getByRole("status").textContent).toBe("");
});

test("the button is disabled and relabelled while checking", async () => {
  let resolve!: (v: null) => void;
  vi.mocked(getPurchase).mockReturnValue(
    new Promise((res) => {
      resolve = res;
    }),
  );
  const { button, type } = setup();
  type(USERNAME);

  fireEvent.click(button);

  await waitFor(() => expect(button.textContent).toBe("Checking…"));
  expect(button.disabled).toBe(true);

  resolve(null);
  await waitFor(() => expect(button.textContent).toBe("Check purchase"));
});
