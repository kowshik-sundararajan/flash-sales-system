import {
  isDependencyOutage,
  ServiceUnavailableError,
} from "../errors/errors.js";
import type { Purchase, PurchaseResult } from "../models/purchase.model.js";
import type { PurchasesRepository } from "../repositories/purchases.repository.js";
import type { SaleId } from "../schemas/sale.schema.js";
import type { UserId } from "../schemas/userId.schema.js";

export class PurchaseFailedError extends ServiceUnavailableError {
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
      if (!isDependencyOutage(cause)) throw cause;
      throw new PurchaseFailedError(saleId, userId, { cause });
    }
  }

  async getPurchase(
    saleId: SaleId,
    userId: UserId,
  ): Promise<Pick<Purchase, "purchasedAt"> | null> {
    try {
      const purchasedAt = await this.purchasesRepository.getPurchasedAt(
        saleId,
        userId,
      );
      return purchasedAt === null ? null : { purchasedAt };
    } catch (cause) {
      if (!isDependencyOutage(cause)) throw cause;

      throw new ServiceUnavailableError(
        `purchase lookup failed for sale: ${saleId} and user: ${userId}`,
        { cause },
      );
    }
  }
}
