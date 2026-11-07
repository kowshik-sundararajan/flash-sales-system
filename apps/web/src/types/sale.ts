export type SaleStatus = "upcoming" | "active" | "sold_out" | "ended";

export interface SaleStatusResponse {
  saleId: string;
  status: SaleStatus;
  startsAt: number;
  endsAt: number;
  stock: number;
  serverTime: number;
  product: { id: string; name: string };
}
