import type { PurchaseResult } from "../models/purchase.model.js";
import type { PurchasesRepository } from "../repositories/purchase.repository.js";
import type { SaleId } from "../schemas/sale.schema.js";
import type { UserId } from "../schemas/userId.schema.js";

export class PurchaseFailedError extends Error {
  constructor(saleId: SaleId, userId: UserId, options?: ErrorOptions) {
    super(`purchase failed for sale: ${saleId} and user: ${userId}`, options);
    this.name = "PurchaseFailedError";
  }
}

export class PurchasesService {
  constructor(private readonly purchasesRepository: PurchasesRepository) {}

  async purchase(saleId: SaleId, userId: UserId): Promise<PurchaseResult> {
    try {
      const code = await this.purchasesRepository.purchase(saleId, userId);
      return { code };
    } catch (cause) {
      throw new PurchaseFailedError(saleId, userId, { cause });
    }
  }
}
