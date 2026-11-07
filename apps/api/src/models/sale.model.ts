export interface Sale {
  id: string;
  product: Product;
  stock: number;
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
  ENDED = "ended",
}
