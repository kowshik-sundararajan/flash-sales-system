// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useCheckPurchase } from "./useCheckPurchase";
import { getPurchase } from "../lib/purchase/purchase";
import type { Purchase } from "../types/purchase";

vi.mock("../lib/purchase/purchase");

const SALE_ID = "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f";
const USER_ID = "johndoe30";
const OTHER_USER_ID = "alice1";
const BOUGHT: Purchase = { purchasedAt: 1_700_000_000_000 };

const getPurchaseMock = vi.mocked(getPurchase);

afterEach(() => {
  vi.resetAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function setup(userId = USER_ID) {
  return renderHook(({ id }) => useCheckPurchase(SALE_ID, id), {
    initialProps: { id: userId },
  });
}

test("starts idle and does not call getPurchase", () => {
  const { result } = setup();

  expect(result.current.pending).toBe(false);
  expect(result.current.purchase).toBeUndefined();
  expect(result.current.failed).toBe(false);
  expect(getPurchaseMock).not.toHaveBeenCalled();
});

test.each([{ lookup: BOUGHT }, { lookup: null }])(
  "exposes the lookup result $lookup",
  async ({ lookup }) => {
    getPurchaseMock.mockResolvedValue(lookup);
    const { result } = setup();

    await act(() => result.current.check());

    expect(getPurchaseMock).toHaveBeenCalledWith(SALE_ID, USER_ID);
    expect(result.current.purchase).toStrictEqual(lookup);
    expect(result.current.pending).toBe(false);
    expect(result.current.failed).toBe(false);
  },
);

test("is pending while the request is in flight", async () => {
  const request = deferred<Purchase | null>();
  getPurchaseMock.mockReturnValue(request.promise);
  const { result } = setup();

  let call!: Promise<void>;
  act(() => {
    call = result.current.check();
  });
  expect(result.current.pending).toBe(true);

  await act(async () => {
    request.resolve(BOUGHT);
    await call;
  });
  expect(result.current.pending).toBe(false);
});

test("ignores a second check while one is in flight", async () => {
  const request = deferred<Purchase | null>();
  getPurchaseMock.mockReturnValue(request.promise);
  const { result } = setup();

  let first!: Promise<void>;
  await act(async () => {
    first = result.current.check();
    await result.current.check();
  });

  expect(getPurchaseMock).toHaveBeenCalledTimes(1);

  await act(async () => {
    request.resolve(BOUGHT);
    await first;
  });
});

test("sets failed when the request throws, and clears it on retry", async () => {
  getPurchaseMock.mockRejectedValueOnce(
    new Error("purchase lookup failed: 500"),
  );
  const { result } = setup();

  await act(() => result.current.check());
  expect(result.current.failed).toBe(true);
  expect(result.current.purchase).toBeUndefined();

  getPurchaseMock.mockResolvedValue(BOUGHT);
  await act(() => result.current.check());
  expect(result.current.failed).toBe(false);
  expect(result.current.purchase).toEqual(BOUGHT);
});

test("hides the result once the username changes", async () => {
  getPurchaseMock.mockResolvedValue(BOUGHT);
  const { result, rerender } = setup();
  await act(() => result.current.check());
  expect(result.current.purchase).toEqual(BOUGHT);

  rerender({ id: OTHER_USER_ID });

  expect(result.current.purchase).toBeUndefined();
  expect(result.current.failed).toBe(false);
});
