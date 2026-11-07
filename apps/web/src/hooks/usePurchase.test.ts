// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { usePurchase } from "./usePurchase";
import { postPurchase } from "../lib/purchase/purchase";
import { PURCHASE_CODE, type PurchaseResponse } from "../types/purchase";

vi.mock("../lib/purchase/purchase");

const SALE_ID = "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f";
const USER_ID = "johndoe30";
const PURCHASED: PurchaseResponse = { code: PURCHASE_CODE.PURCHASED };

const postPurchaseMock = vi.mocked(postPurchase);

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

function setup() {
  return renderHook(() => usePurchase(SALE_ID, USER_ID));
}

test("starts idle and does not call postPurchase", () => {
  const { result } = setup();

  expect(result.current.pending).toBe(false);
  expect(result.current.code).toBeUndefined();
  expect(result.current.failed).toBe(false);
  expect(postPurchaseMock).not.toHaveBeenCalled();
});

test("calls postPurchase and exposes the code", async () => {
  postPurchaseMock.mockResolvedValue(PURCHASED);
  const { result } = setup();

  await act(() => result.current.buy());

  expect(postPurchaseMock).toHaveBeenCalledWith(SALE_ID, USER_ID);
  expect(result.current.code).toBe(PURCHASE_CODE.PURCHASED);
  expect(result.current.pending).toBe(false);
  expect(result.current.failed).toBe(false);
});

test("is pending while the request is in flight", async () => {
  const request = deferred<PurchaseResponse>();
  postPurchaseMock.mockReturnValue(request.promise);
  const { result } = setup();

  let call!: Promise<void>;
  act(() => {
    call = result.current.buy();
  });
  expect(result.current.pending).toBe(true);

  await act(async () => {
    request.resolve(PURCHASED);
    await call;
  });
  expect(result.current.pending).toBe(false);
});

test("ignores a second buy while one is in flight", async () => {
  const request = deferred<PurchaseResponse>();
  postPurchaseMock.mockReturnValue(request.promise);
  const { result } = setup();

  let first!: Promise<void>;
  await act(async () => {
    first = result.current.buy();
    await result.current.buy();
  });

  expect(postPurchaseMock).toHaveBeenCalledTimes(1);

  await act(async () => {
    request.resolve(PURCHASED);
    await first;
  });
});

test("allows another buy once the previous one settles", async () => {
  postPurchaseMock.mockResolvedValue(PURCHASED);
  const { result } = setup();

  await act(() => result.current.buy());
  await act(() => result.current.buy());

  expect(postPurchaseMock).toHaveBeenCalledTimes(2);
});

test("sets failed when the request throws, and clears it on retry", async () => {
  postPurchaseMock.mockRejectedValueOnce(new Error("purchase failed: 500"));
  const { result } = setup();

  await act(() => result.current.buy());
  expect(result.current.failed).toBe(true);
  expect(result.current.code).toBeUndefined();

  postPurchaseMock.mockResolvedValue(PURCHASED);
  await act(() => result.current.buy());
  expect(result.current.failed).toBe(false);
  expect(result.current.code).toBe(PURCHASE_CODE.PURCHASED);
});
