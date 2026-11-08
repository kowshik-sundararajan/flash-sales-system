import type { SaleStatusResponse } from "../../types/sale";

export async function fetchSaleStatus(
  saleId: string,
): Promise<SaleStatusResponse | null> {
  const response = await fetch(`/api/sales/${encodeURIComponent(saleId)}`);

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`sale status failed: ${response.status}`);

  return (await response.json()) as SaleStatusResponse;
}
