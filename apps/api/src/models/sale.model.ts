export interface Sale {
  id: string;
  product: Product;
  stock: Stock;
  startsAt: number;
  endsAt: number;
}

export interface Product {
  id: string;
  name: string;
}

export enum SaleStatus {
  UPCOMING = "upcoming",
  ACTIVE = "active",
  SOLD_OUT = "sold_out",
  ENDED = "ended",
}

export type Stock = {
  initial: number;
  remaining: number;
};
