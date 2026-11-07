import { SaleStatus, type Product, type Sale } from "../models/sale.model.js";
import type { SalesRepository } from "../repositories/sales.repository.js";
import type { SaleId } from "../schemas/sale.schema.js";

export interface SaleStatusResult {
  saleId: SaleId;
  status: SaleStatus;
  startsAt: number;
  endsAt: number;
  stock: number;
  product: Product;
}

export class SaleNotFoundError extends Error {
  constructor(saleId: SaleId) {
    super(`sale not found: ${saleId}`);
    this.name = "SaleNotFoundError";
  }
}

export function getSaleStatus(
  { startsAt, endsAt }: Pick<Sale, "startsAt" | "endsAt">,
  now: number,
  stock: number,
): SaleStatus {
  if (now < startsAt) return SaleStatus.UPCOMING;
  if (now >= endsAt) return SaleStatus.ENDED;

  return stock > 0 ? SaleStatus.ACTIVE : SaleStatus.SOLD_OUT;
}

export class SalesService {
  constructor(private readonly sales: SalesRepository) {}

  async getStatus(
    saleId: SaleId,
    now: number | undefined = Date.now(),
  ): Promise<SaleStatusResult> {
    const sale = await this.sales.findById(saleId);
    if (!sale) throw new SaleNotFoundError(saleId);

    return {
      saleId: sale.id,
      status: getSaleStatus(sale, now, sale.stock),
      startsAt: sale.startsAt,
      endsAt: sale.endsAt,
      stock: sale.stock,
      product: sale.product,
    };
  }
}
