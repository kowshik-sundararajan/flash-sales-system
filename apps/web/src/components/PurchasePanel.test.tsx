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
import { getPurchase, postPurchase } from "../lib/purchase/purchase";
import { PURCHASE_CODE } from "../types/purchase";
import type { SaleStatus } from "../types/sale";

vi.mock("../lib/purchase/purchase");

const SALE_ID = "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f";
const USERNAME = "johndoe30";
const HINT = "Use 3 to 32 letters and digits";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function setup(status: SaleStatus = "active") {
  render(<PurchasePanel saleId={SALE_ID} status={status} />);
  const input = screen.getByLabelText<HTMLInputElement>("Username");
  const buy = screen.getByRole<HTMLButtonElement>("button", {
    name: /buy now|buying/i,
  });
  const check = screen.getByRole<HTMLButtonElement>("button", {
    name: /check purchase|checking/i,
  });
  const type = (value: string) =>
    fireEvent.change(input, { target: { value } });
  return { input, buy, check, type };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

test("both buttons are disabled until a valid username is typed", () => {
  const { buy, check, type } = setup();
  expect(buy.disabled).toBe(true);
  expect(check.disabled).toBe(true);

  type("ko");
  expect(buy.disabled).toBe(true);
  expect(check.disabled).toBe(true);

  type(USERNAME);
  expect(buy.disabled).toBe(false);
  expect(check.disabled).toBe(false);
});

test("the hint is always shown and turns into an error only when the name is invalid", () => {
  const { input, type } = setup();
  expect(screen.getByText(HINT)).toBeTruthy();
  expect(input.className).not.toContain("is-invalid");

  type("kow 42");
  expect(input.className).toContain("is-invalid");
  expect(screen.getByText(HINT).className).toContain("is-error");

  type(USERNAME);
  expect(input.className).not.toContain("is-invalid");
  expect(screen.getByText(HINT).className).not.toContain("is-error");
});

test.each<[SaleStatus, string]>([
  ["upcoming", "Buying opens when the sale starts."],
  ["sold_out", "Nothing left to buy."],
  ["ended", "Buying is closed."],
])(
  "when the sale is %s, buying is disabled with a reason but checking still works",
  (status, reason) => {
    const { buy, check, type } = setup(status);
    type(USERNAME);

    expect(buy.disabled).toBe(true);
    expect(check.disabled).toBe(false);
    expect(screen.getByText(reason)).toBeTruthy();
  },
);

test("no reason is shown while the sale is active", () => {
  setup("active");

  expect(
    screen.queryByText(/Buying opens|Nothing left|Buying is closed/),
  ).toBeNull();
});

test("buying posts the trimmed username and shows a success banner", async () => {
  vi.mocked(postPurchase).mockResolvedValue({ code: PURCHASE_CODE.PURCHASED });
  const { buy, type } = setup();
  type(`  ${USERNAME}  `);

  fireEvent.click(buy);

  const message = await screen.findByText("You got it!");
  expect(message.closest(".banner")!.className).toContain("tone-success");
  expect(postPurchase).toHaveBeenCalledWith(SALE_ID, USERNAME);
});

test.each([
  [
    PURCHASE_CODE.ALREADY_PURCHASED,
    "You have already bought this item.",
    "info",
  ],
  [PURCHASE_CODE.SOLD_OUT, "Sold out.", "warning"],
  [PURCHASE_CODE.ENDED, "The sale has ended.", "neutral"],
  [
    PURCHASE_CODE.NOT_CONFIGURED,
    "This sale is not available right now.",
    "danger",
  ],
])("a %s result shows %j in a %s banner", async (code, text, tone) => {
  vi.mocked(postPurchase).mockResolvedValue({ code });
  const { buy, type } = setup();
  type(USERNAME);

  fireEvent.click(buy);

  const message = await screen.findByText(text);
  expect(message.closest(".banner")!.className).toContain(`tone-${tone}`);
});

test("pressing Enter in the field buys", async () => {
  vi.mocked(postPurchase).mockResolvedValue({ code: PURCHASE_CODE.PURCHASED });
  const { input, type } = setup();
  type(USERNAME);

  fireEvent.submit(input.closest("form")!);

  await waitFor(() => expect(postPurchase).toHaveBeenCalledOnce());
});

test("submitting does nothing when buying is not allowed", () => {
  const { input, type } = setup("upcoming");
  type(USERNAME);

  fireEvent.submit(input.closest("form")!);

  expect(postPurchase).not.toHaveBeenCalled();
});

test("shows a generic error banner when the purchase request fails", async () => {
  vi.mocked(postPurchase).mockRejectedValue(new Error("purchase failed: 500"));
  const { buy, type } = setup();
  type(USERNAME);

  fireEvent.click(buy);

  const message = await screen.findByText(
    "Something went wrong. Please try again.",
  );
  expect(message.closest(".banner")!.className).toContain("tone-danger");
});

test("a failed buy that actually went through is shown as purchased", async () => {
  vi.mocked(postPurchase).mockRejectedValue(new Error("purchase failed: 503"));
  vi.mocked(getPurchase).mockResolvedValue({ purchasedAt: 1_700_000_000_000 });
  const { buy, type } = setup();
  type(USERNAME);

  fireEvent.click(buy);

  expect(await screen.findByText("You got it!")).toBeTruthy();
});

test("when a failed buy cannot be confirmed either, it says so and points to Check purchase", async () => {
  vi.mocked(postPurchase).mockRejectedValue(new Error("purchase failed: 503"));
  vi.mocked(getPurchase).mockRejectedValue(new Error("lookup failed: 503"));
  const { buy, type } = setup();
  type(USERNAME);

  fireEvent.click(buy);

  const message = await screen.findByText(/couldn't confirm your purchase/);
  expect(message.textContent).toContain("Press Check purchase");
  expect(message.closest(".banner")!.className).toContain("tone-warning");
});

test("while buying, the button says so and both actions are disabled", async () => {
  const request = deferred<{ code: typeof PURCHASE_CODE.PURCHASED }>();
  vi.mocked(postPurchase).mockReturnValue(request.promise);
  const { buy, check, type } = setup();
  type(USERNAME);

  fireEvent.click(buy);

  await waitFor(() => expect(buy.textContent).toBe("Buying…"));
  expect(buy.disabled).toBe(true);
  expect(check.disabled).toBe(true);

  request.resolve({ code: PURCHASE_CODE.PURCHASED });
  await waitFor(() => expect(buy.textContent).toBe("Buy now"));
});

test("the result is cleared when the username is edited", async () => {
  vi.mocked(postPurchase).mockResolvedValue({ code: PURCHASE_CODE.PURCHASED });
  const { buy, type } = setup();
  type(USERNAME);
  fireEvent.click(buy);
  await screen.findByText("You got it!");

  type("someoneelse");

  expect(screen.queryByText("You got it!")).toBeNull();
});

test("checking uses the trimmed username and says the user secured the item", async () => {
  vi.mocked(getPurchase).mockResolvedValue({ purchasedAt: 1_700_000_000_000 });
  const { check, type } = setup();
  type(`  ${USERNAME}  `);

  fireEvent.click(check);

  const message = await screen.findByText("You secured this item.");
  expect(message.closest(".banner")!.className).toContain("tone-success");
  expect(getPurchase).toHaveBeenCalledWith(SALE_ID, USERNAME);
});

test("checking says no purchase was found for a user who has not bought", async () => {
  vi.mocked(getPurchase).mockResolvedValue(null);
  const { check, type } = setup();
  type(USERNAME);

  fireEvent.click(check);

  expect(
    await screen.findByText("No purchase found for this username."),
  ).toBeTruthy();
});

test("shows a generic error banner when the lookup fails", async () => {
  vi.mocked(getPurchase).mockRejectedValue(new Error("lookup failed: 500"));
  const { check, type } = setup();
  type(USERNAME);

  fireEvent.click(check);

  expect(
    await screen.findByText("Something went wrong. Please try again."),
  ).toBeTruthy();
});

test("the check button is relabelled while checking", async () => {
  const request = deferred<null>();
  vi.mocked(getPurchase).mockReturnValue(request.promise);
  const { check, type } = setup();
  type(USERNAME);

  fireEvent.click(check);

  await waitFor(() => expect(check.textContent).toBe("Checking…"));
  expect(check.disabled).toBe(true);

  request.resolve(null);
  await waitFor(() => expect(check.textContent).toBe("Check purchase"));
});

test("only the latest action's result is shown", async () => {
  vi.mocked(postPurchase).mockResolvedValue({ code: PURCHASE_CODE.PURCHASED });
  vi.mocked(getPurchase).mockResolvedValue({ purchasedAt: 1_700_000_000_000 });
  const { buy, check, type } = setup();
  type(USERNAME);
  fireEvent.click(buy);
  await screen.findByText("You got it!");

  fireEvent.click(check);

  await screen.findByText("You secured this item.");
  expect(screen.queryByText("You got it!")).toBeNull();
});

test("the result area is always present, so results do not shift the layout", () => {
  setup();

  expect(screen.getByRole("status").className).toContain("feedback");
});
