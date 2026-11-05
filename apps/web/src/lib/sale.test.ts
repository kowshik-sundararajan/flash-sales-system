import { afterEach, expect, test, vi } from "vitest";
import { fetchSaleStatus } from "./sale";
import type { SaleStatusResponse } from "../types/sale";

const body: SaleStatusResponse = {
  saleId: "sale-1",
  status: "active",
  startsAt: 1_000,
  endsAt: 2_000,
  serverTime: 1_500,
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
  const fetchMock = stubFetch(Response.json(body));

  expect(await fetchSaleStatus("sale-1")).toEqual(body);
  expect(fetchMock).toHaveBeenCalledWith("/api/sales/sale-1");
});

test("returns null when the sale is not found", async () => {
  stubFetch(new Response(null, { status: 404 }));

  expect(await fetchSaleStatus("missing")).toBeNull();
});

test("throws on other non-2xx responses", async () => {
  stubFetch(new Response(null, { status: 500 }));

  await expect(fetchSaleStatus("sale-1")).rejects.toThrow(
    "sale status failed: 500",
  );
});
