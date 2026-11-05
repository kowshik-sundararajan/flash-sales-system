export type SaleStatus = "upcoming" | "active" | "ended";

export interface SaleStatusResponse {
  saleId: string;
  status: SaleStatus;
  startsAt: number;
  endsAt: number;
  serverTime: number;
  product: { id: string; name: string };
}
