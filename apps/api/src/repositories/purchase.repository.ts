import type { Redis } from "ioredis";
import { PURCHASE_CODE, type PurchaseCode } from "../models/purchase.model.js";
import type { SaleId } from "../schemas/sale.schema.js";
import type { UserId } from "../schemas/userId.schema.js";

const PURCHASE_SCRIPT = `
local saleKey, userKey = KEYS[1], KEYS[2]

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

return '${PURCHASE_CODE.PURCHASED}'
`;

/**
 * sale: stores sale config (startsAt, endsAt, stock)
 * user: indicates if user made a purchase and at what time
 */
export const saleKeys = {
  sale: (saleId: string) => `{sale:${saleId}}:sale`,
  user: (saleId: string, userId: string) => `{sale:${saleId}}:user:${userId}`,
  all: (saleId: string) => `{sale:${saleId}}:*`,
};

export interface PurchasesRepository {
  purchase(saleId: SaleId, userId: UserId): Promise<PurchaseCode>;
  getPurchasedAt(saleId: SaleId, userId: UserId): Promise<number | null>;
}

export class RedisPurchasesRepository implements PurchasesRepository {
  constructor(private readonly redis: Redis) {}

  async purchase(saleId: SaleId, userId: UserId): Promise<PurchaseCode> {
    const code = await this.redis.eval(
      PURCHASE_SCRIPT,
      2,
      saleKeys.sale(saleId),
      saleKeys.user(saleId, userId),
    );

    return code as PurchaseCode;
  }

  async getPurchasedAt(saleId: SaleId, userId: UserId): Promise<number | null> {
    const purchasedAt = await this.redis.get(saleKeys.user(saleId, userId));

    return purchasedAt === null ? null : Number(purchasedAt);
  }
}
