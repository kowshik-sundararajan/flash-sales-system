import type { Collection, Db } from "mongodb";
import type { Sale } from "../models/sale.model.js";
import type { SaleId } from "../schemas/sale.schema.js";

export const SALES_COLLECTION_NAME = "sales";
const CACHE_TTL_MS = 1_000;
const CACHE_MAX_SIZE = 1_000;

export type SaleDocument = Omit<Sale, "id"> & { _id: string };

interface CacheOptions {
  ttl?: number;
  maxItems?: number;
  now?: () => number;
}

interface CachedSale {
  sale: Sale;
  expiresAt: number;
}

export interface SalesRepository {
  findById(id: SaleId): Promise<Sale | null>;
  setRemainingStockFromPurchaseCount(
    id: SaleId,
    purchaseCount: number,
  ): Promise<void>;
}

function toSale({ _id, product, stock, startsAt, endsAt }: SaleDocument): Sale {
  return {
    id: _id,
    product,
    stock,
    startsAt,
    endsAt,
  };
}

export class MongoSalesRepository implements SalesRepository {
  private readonly sales: Collection<SaleDocument>;
  private readonly cache = new Map<SaleId, CachedSale>();
  private readonly ttl: number;
  private readonly maxItems: number;
  private readonly now: () => number;

  constructor(db: Db, options: CacheOptions = {}) {
    this.sales = db.collection(SALES_COLLECTION_NAME);
    this.ttl = options.ttl ?? CACHE_TTL_MS;
    this.maxItems = options.maxItems ?? CACHE_MAX_SIZE;
    this.now = options.now ?? Date.now;
  }

  async findById(id: SaleId): Promise<Sale | null> {
    const cached = this.cache.get(id);
    if (cached && cached.expiresAt > this.now()) return cached.sale;

    const doc = await this.sales.findOne({ _id: id });
    if (!doc) return null;

    const sale = toSale(doc);
    this.cache.delete(id);

    if (this.cache.size >= this.maxItems) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }

    this.cache.set(id, { sale, expiresAt: this.now() + this.ttl });

    return sale;
  }

  async setRemainingStockFromPurchaseCount(
    id: SaleId,
    purchaseCount: number,
  ): Promise<void> {
    await this.sales.updateOne({ _id: id }, [
      {
        $set: {
          "stock.remaining": {
            $min: [
              "$stock.remaining",
              { $max: [0, { $subtract: ["$stock.initial", purchaseCount] }] },
            ],
          },
        },
      },
    ]);
  }
}
