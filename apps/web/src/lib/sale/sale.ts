import type { SaleStatusResponse } from "../../types/sale";

export async function fetchSaleStatus(
  saleId: string,
): Promise<SaleStatusResponse | null> {
  const res = await fetch(`/api/sales/${encodeURIComponent(saleId)}`);

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`sale status failed: ${res.status}`);

  return (await res.json()) as SaleStatusResponse;
}
