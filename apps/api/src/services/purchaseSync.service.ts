import type { Purchase } from "../models/purchase.model.js";
import type { PurchasesStore } from "../repositories/purchases.repository.js";
import type {
  PurchaseStream,
  RejectedEntry,
  StreamEntry,
} from "../repositories/purchaseStream.repository.js";
import type { SalesRepository } from "../repositories/sales.repository.js";
import { purchaseStreamEntrySchema } from "../schemas/purchase.schema.js";
import type { SaleId } from "../schemas/sale.schema.js";

export type OnDeadLetter = (
  saleId: SaleId,
  entry: StreamEntry,
  reason: string,
) => void;

/**
 * Sync purchases from redis stream to mongo
 *   - read in batches of 500 using consumer groups
 *   - for each batch:
 *       - insert entries into mongo
 *       - update remaining stock count
 *       - delete entries from stream
 *
 *   - stream entries that cannot be processed are added to a dead letter stream
 *   - if a worker crashes, another worker will claim the "abandoned entries"

 */
export class PurchaseSyncService {
  constructor(
    private readonly purchaseStream: Pick<
      PurchaseStream,
      "readBatch" | "deadLetter" | "ack"
    >,
    private readonly purchasesRepository: Pick<
      PurchasesStore,
      "insertMany" | "countBySaleId"
    >,
    private readonly salesRepository: Pick<
      SalesRepository,
      "setRemainingStockFromPurchaseCount"
    >,
    private readonly consumer: string,
    private readonly onDeadLetter: OnDeadLetter = () => {},
  ) {}

  async syncBatch(saleId: SaleId): Promise<number> {
    const entries = await this.purchaseStream.readBatch(saleId, this.consumer);

    if (entries.length === 0) return 0;

    const purchases: Purchase[] = [];
    const rejected: RejectedEntry[] = [];

    for (const entry of entries) {
      const parsed = purchaseStreamEntrySchema.safeParse(entry.fields);

      if (parsed.success) {
        purchases.push(parsed.data);
      } else {
        const reason = parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ");
        rejected.push({ entry, reason });
      }
    }

    if (purchases.length > 0) {
      await this.purchasesRepository.insertMany(purchases);
      const storedPurchaseCount =
        await this.purchasesRepository.countBySaleId(saleId);
      await this.salesRepository.setRemainingStockFromPurchaseCount(
        saleId,
        storedPurchaseCount,
      );
    }

    if (rejected.length > 0) {
      await this.purchaseStream.deadLetter(saleId, rejected);
      for (const { entry, reason } of rejected) {
        this.onDeadLetter(saleId, entry, reason);
      }
    }

    await this.purchaseStream.ack(
      saleId,
      entries.map((entry) => entry.id),
    );
    return entries.length;
  }
}
