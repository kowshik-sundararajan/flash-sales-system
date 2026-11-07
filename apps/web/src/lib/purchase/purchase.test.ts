import { afterEach, expect, test, vi } from "vitest";
import { getPurchase, postPurchase } from "./purchase";
import { PURCHASE_CODE } from "../../types/purchase";

const SALE_ID = "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f";
const USER_ID = "johndoe30";

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("posts the user id to the sale's purchases endpoint", async () => {
  const fetchMock = stubFetch(
    Response.json({ code: PURCHASE_CODE.PURCHASED }, { status: 201 }),
  );

  await postPurchase(SALE_ID, USER_ID);

  expect(fetchMock).toHaveBeenCalledWith(`/api/sales/${SALE_ID}/purchases`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: USER_ID }),
  });
});

test("url-encodes the sale id", async () => {
  const fetchMock = stubFetch(
    Response.json({ code: PURCHASE_CODE.PURCHASED }, { status: 201 }),
  );

  await postPurchase("a/b", USER_ID);

  expect(fetchMock.mock.calls[0][0]).toBe("/api/sales/a%2Fb/purchases");
});

test("returns the response on a successful purchase", async () => {
  stubFetch(Response.json({ code: PURCHASE_CODE.PURCHASED }, { status: 201 }));

  expect(await postPurchase(SALE_ID, USER_ID)).toEqual({
    code: PURCHASE_CODE.PURCHASED,
  });
});

test.each([
  [PURCHASE_CODE.ALREADY_PURCHASED, 409],
  [PURCHASE_CODE.SOLD_OUT, 409],
  [PURCHASE_CODE.NOT_STARTED, 409],
  [PURCHASE_CODE.ENDED, 409],
  [PURCHASE_CODE.NOT_CONFIGURED, 503],
])("returns %s instead of throwing on a %i response", async (code, status) => {
  stubFetch(Response.json({ code }, { status }));

  expect(await postPurchase(SALE_ID, USER_ID)).toEqual({ code });
});

test("throws on a response without a known code", async () => {
  stubFetch(Response.json({ error: "invalid_request" }, { status: 400 }));

  await expect(postPurchase(SALE_ID, USER_ID)).rejects.toThrow(
    "purchase failed: 400",
  );
});

test("throws on an unrecognised code", async () => {
  stubFetch(Response.json({ code: "NOPE" }, { status: 409 }));

  await expect(postPurchase(SALE_ID, USER_ID)).rejects.toThrow(
    "purchase failed: 409",
  );
});

test("throws when the body is not valid JSON", async () => {
  stubFetch(new Response("<html>bad gateway</html>", { status: 502 }));

  await expect(postPurchase(SALE_ID, USER_ID)).rejects.toThrow(
    "purchase failed: 502",
  );
});

test("propagates network failures", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

  await expect(postPurchase(SALE_ID, USER_ID)).rejects.toThrow("offline");
});

const PURCHASED_AT = 1_700_000_000_000;

test("getPurchase requests the user's purchase and url-encodes both ids", async () => {
  const fetchMock = vi
    .fn()
    .mockImplementation(async () =>
      Response.json({ purchasedAt: PURCHASED_AT }),
    );
  vi.stubGlobal("fetch", fetchMock);

  await getPurchase(SALE_ID, USER_ID);
  await getPurchase("a/b", "c/d");

  expect(fetchMock.mock.calls[0][0]).toBe(
    `/api/sales/${SALE_ID}/purchases/${USER_ID}`,
  );
  expect(fetchMock.mock.calls[1][0]).toBe("/api/sales/a%2Fb/purchases/c%2Fd");
});

test("getPurchase returns the purchase when the user has bought", async () => {
  stubFetch(Response.json({ purchasedAt: PURCHASED_AT }));

  expect(await getPurchase(SALE_ID, USER_ID)).toEqual({
    purchasedAt: PURCHASED_AT,
  });
});

test("getPurchase returns null on the API's not-found response", async () => {
  stubFetch(Response.json({ error: "purchase_not_found" }, { status: 404 }));

  expect(await getPurchase(SALE_ID, USER_ID)).toBeNull();
});

test("getPurchase throws on a 404 that is not the API's not-found response", async () => {
  stubFetch(new Response("<html>not found</html>", { status: 404 }));

  await expect(getPurchase(SALE_ID, USER_ID)).rejects.toThrow(
    "purchase lookup failed: 404",
  );
});

test.each([
  [
    "a 400 response",
    Response.json({ error: "invalid_request" }, { status: 400 }),
  ],
  [
    "a 500 response",
    Response.json({ error: "internal_error" }, { status: 500 }),
  ],
  ["a 200 without purchasedAt", Response.json({})],
  ["a non-JSON body", new Response("bad gateway", { status: 502 })],
])("getPurchase throws on %s", async (_name, response) => {
  stubFetch(response);

  await expect(getPurchase(SALE_ID, USER_ID)).rejects.toThrow(
    "purchase lookup failed",
  );
});

test("getPurchase propagates network failures", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

  await expect(getPurchase(SALE_ID, USER_ID)).rejects.toThrow("offline");
});
