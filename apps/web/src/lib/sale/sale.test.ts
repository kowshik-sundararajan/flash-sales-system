import { afterEach, expect, test, vi } from "vitest";
import { fetchSaleStatus } from "./sale";
import type { SaleStatusResponse } from "../../types/sale";

const SALE_ID = "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f";

const SALE_STATUS: SaleStatusResponse = {
  saleId: SALE_ID,
  status: "active",
  startsAt: 1_000,
  endsAt: 2_000,
  serverTime: 1_500,
  stock: { initial: 10, remaining: 10 },
  product: { id: "p1", name: "Best Headphones" },
};

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("returns the parsed sale status on success", async () => {
  const fetchMock = stubFetch(Response.json(SALE_STATUS));

  expect(await fetchSaleStatus(SALE_ID)).toEqual(SALE_STATUS);
  expect(fetchMock).toHaveBeenCalledWith(`/api/sales/${SALE_ID}`);
});

test("returns null when the sale is not found", async () => {
  stubFetch(new Response(null, { status: 404 }));

  expect(await fetchSaleStatus("missing")).toBeNull();
});

test("throws on other non-2xx responses", async () => {
  stubFetch(new Response(null, { status: 500 }));

  await expect(fetchSaleStatus(SALE_ID)).rejects.toThrow(
    "sale status failed: 500",
  );
});
