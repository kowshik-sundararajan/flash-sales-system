import { SaleStatus, type Product, type Sale } from "../models/sale.model.js";
import type { SalesRepository } from "../repositories/sales.repository.js";

export interface SaleStatusResult {
  saleId: string;
  status: SaleStatus;
  startsAt: number;
  endsAt: number;
  product: Product;
}

export class SaleNotFoundError extends Error {
  constructor(saleId: string) {
    super(`sale not found: ${saleId}`);
    this.name = "SaleNotFoundError";
  }
}

export function getSaleStatus(
  { startsAt, endsAt }: Pick<Sale, "startsAt" | "endsAt">,
  now: number,
): SaleStatus {
  if (now < startsAt) return SaleStatus.UPCOMING;
  if (now >= endsAt) return SaleStatus.ENDED;
  return SaleStatus.ACTIVE;
}

export class SalesService {
  constructor(private readonly sales: SalesRepository) {}

  async getStatus(
    saleId: string,
    now: number | undefined = Date.now(),
  ): Promise<SaleStatusResult> {
    const sale = await this.sales.findById(saleId);
    if (!sale) throw new SaleNotFoundError(saleId);

    return {
      saleId: sale.id,
      status: getSaleStatus(sale, now),
      startsAt: sale.startsAt,
      endsAt: sale.endsAt,
      product: sale.product,
    };
  }
}
