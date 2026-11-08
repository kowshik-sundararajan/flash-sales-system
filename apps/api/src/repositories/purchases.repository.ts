import type { RedisClient } from "../bootstrap.js";
import {
  PURCHASE_CODE,
  type Purchase,
  type PurchaseCode,
} from "../models/purchase.model.js";
import type { SaleId } from "../schemas/sale.schema.js";
import type { UserId } from "../schemas/userId.schema.js";
import { type Collection, type Db, MongoBulkWriteError } from "mongodb";

const PURCHASE_SCRIPT = `
local saleKey, userKey, streamKey = KEYS[1], KEYS[2], KEYS[3]
local saleId, userId = ARGV[1], ARGV[2]

-- 1. Is the sale configured?
local sale = redis.call('HMGET', saleKey, 'startsAt', 'endsAt', 'stock')
if not sale[1] or not sale[2] or not sale[3] then
  return '${PURCHASE_CODE.NOT_CONFIGURED}'
end

-- 2. Is the purchase within the sale window?
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
if now < tonumber(sale[1]) then return '${PURCHASE_CODE.NOT_STARTED}' end
if now >= tonumber(sale[2]) then return '${PURCHASE_CODE.ENDED}' end

-- 3. Has the user already purchased the item?
if redis.call('EXISTS', userKey) == 1 then
  return '${PURCHASE_CODE.ALREADY_PURCHASED}'
end

-- 4. Is there enough stock?
if tonumber(sale[3]) <= 0 then return '${PURCHASE_CODE.SOLD_OUT}' end

-- 5. Commit the purchase
redis.call('HINCRBY', saleKey, 'stock', -1)
redis.call('SET', userKey, now)

-- 6. Append to redis stream
redis.call('XADD', streamKey, '*', 'saleId', saleId, 'userId', userId, 'purchasedAt', now)


return '${PURCHASE_CODE.PURCHASED}'
`;

/**
 * sale: stores sale config (startsAt, endsAt, stock)
 * user: indicates if user made a purchase and at what time
 * stream: one entry per successful purchase, consumed to sync to Mongo
 */
export const saleKeys = {
  sale: (saleId: SaleId) => `{sale:${saleId}}:sale`,
  user: (saleId: SaleId, userId: UserId) => `{sale:${saleId}}:user:${userId}`,
  stream: (saleId: SaleId) => `{sale:${saleId}}:purchases`,
  deadLetter: (saleId: SaleId) => `{sale:${saleId}}:purchases:dead`,
  all: (saleId: SaleId) => `{sale:${saleId}}:*`,
};

export interface PurchasesRepository {
  purchase(saleId: SaleId, userId: UserId): Promise<PurchaseCode>;
  getPurchasedAt(saleId: SaleId, userId: UserId): Promise<number | null>;
}

export class RedisPurchasesRepository implements PurchasesRepository {
  constructor(
    private readonly redis: RedisClient,
    private readonly commandTimeoutMs = 200,
  ) {}

  async purchase(saleId: SaleId, userId: UserId): Promise<PurchaseCode> {
    const code = await withTimeout(
      this.redis.eval(PURCHASE_SCRIPT, {
        keys: [
          saleKeys.sale(saleId),
          saleKeys.user(saleId, userId),
          saleKeys.stream(saleId),
        ],
        arguments: [saleId, userId],
      }),
      this.commandTimeoutMs,
    );

    return code as PurchaseCode;
  }

  async getPurchasedAt(saleId: SaleId, userId: UserId): Promise<number | null> {
    const purchasedAt = await withTimeout(
      this.redis.get(saleKeys.user(saleId, userId)),
      this.commandTimeoutMs,
    );

    return purchasedAt === null ? null : Number(purchasedAt);
  }
}

async function withTimeout<T>(command: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      reject,
      ms,
      new Error(`Redis command timed out after ${ms}ms`),
    );
  });

  try {
    return await Promise.race([command, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export const PURCHASES_COLLECTION_NAME = "purchases";
const DUPLICATE_KEY = 11000;

export interface PurchasesStore {
  insertMany(purchases: Purchase[]): Promise<number>;
  countBySaleId(saleId: SaleId): Promise<number>;
}

export class MongoPurchasesRepository implements PurchasesStore {
  private readonly purchases: Collection<Purchase>;

  constructor(db: Db) {
    this.purchases = db.collection(PURCHASES_COLLECTION_NAME);
  }

  async insertMany(purchases: Purchase[]): Promise<number> {
    if (purchases.length === 0) return 0;

    try {
      const result = await this.purchases.insertMany(
        purchases.map((purchase) => ({ ...purchase })),
        { ordered: false },
      );

      return result.insertedCount;
    } catch (error) {
      if (error instanceof MongoBulkWriteError && onlyDuplicates(error)) {
        return error.insertedCount;
      }
      throw error;
    }
  }

  async countBySaleId(saleId: SaleId): Promise<number> {
    return this.purchases.countDocuments({ saleId });
  }
}

function onlyDuplicates(err: MongoBulkWriteError): boolean {
  const writeErrors = [err.writeErrors].flat();
  return (
    writeErrors.length > 0 && writeErrors.every((e) => e.code === DUPLICATE_KEY)
  );
}

export async function ensurePurchaseIndexes(db: Db): Promise<void> {
  await db
    .collection(PURCHASES_COLLECTION_NAME)
    .createIndex({ saleId: 1, userId: 1 }, { unique: true }, undefined);
}
