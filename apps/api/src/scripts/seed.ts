import type { Db } from "mongodb";
import { loadConfig } from "../config.js";
import {
  createMongoClient,
  createRedisClient,
  type RedisClient,
} from "../bootstrap.js";
import {
  ensurePurchaseIndexes,
  PURCHASES_COLLECTION_NAME,
  saleKeys,
} from "../repositories/purchases.repository.js";
import { RedisPurchaseStream } from "../repositories/purchaseStream.repository.js";
import {
  SALES_COLLECTION_NAME,
  type SaleDocument,
} from "../repositories/sales.repository.js";
import { saleIdSchema, type SaleId } from "../schemas/sale.schema.js";

export interface SaleConfig {
  saleId: SaleId;
  startsAt: number;
  endsAt: number;
  stock: number;
}

const DEFAULT_STARTS_IN_SECONDS = 15;
const DEFAULT_DURATION_SECONDS = 3600;
const DEFAULT_STOCK = 100;

function read(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function readInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
): number {
  const raw = read(env, name);
  if (raw === undefined) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(
      `env error: ${name} must be an integer of at least ${min}, got ${raw}`,
    );
  }
  return value;
}

function readTime(env: NodeJS.ProcessEnv, name: string): number | undefined {
  const raw = read(env, name);
  if (raw === undefined) return undefined;

  const value = Date.parse(raw);
  if (Number.isNaN(value)) {
    throw new Error(
      `env error: ${name} must be an ISO 8601 date-time, got ${raw}`,
    );
  }
  return value;
}

export function loadSaleConfig(
  env: NodeJS.ProcessEnv,
  now: number = Date.now(),
): SaleConfig {
  const saleId = saleIdSchema.safeParse(env.SALE_ID);
  if (!saleId.success) {
    throw new Error(`env error: SALE_ID must be a UUID, got ${env.SALE_ID}`);
  }

  const startsAt =
    readTime(env, "SALE_STARTS_AT") ??
    now +
      readInteger(env, "SALE_STARTS_IN_SECONDS", DEFAULT_STARTS_IN_SECONDS, 0) *
        1000;

  const endsAt =
    readTime(env, "SALE_ENDS_AT") ??
    startsAt +
      readInteger(env, "SALE_DURATION_SECONDS", DEFAULT_DURATION_SECONDS, 1) *
        1000;

  if (endsAt <= startsAt) {
    throw new Error("env error: the sale must end after it starts");
  }

  const stock = readInteger(env, "SALE_STOCK", DEFAULT_STOCK, 1);

  return { saleId: saleId.data, startsAt, endsAt, stock };
}

async function createSale(
  db: Db,
  redis: RedisClient,
  config: SaleConfig,
): Promise<void> {
  const { saleId, startsAt, endsAt, stock } = config;

  const sale: SaleDocument = {
    _id: saleId,
    product: { id: "product-1", name: "Best Headphones" },
    stock: { initial: stock, remaining: stock },
    startsAt,
    endsAt,
  };

  await db
    .collection<SaleDocument>(SALES_COLLECTION_NAME)
    .replaceOne({ _id: saleId }, sale, { upsert: true });
  await db.collection(PURCHASES_COLLECTION_NAME).deleteMany({ saleId });

  const staleKeys: string[] = [];
  for await (const keysBatch of redis.scanIterator({
    MATCH: saleKeys.all(saleId),
    COUNT: 100,
  })) {
    staleKeys.push(...keysBatch);
  }

  const transaction = redis.multi();
  if (staleKeys.length > 0) transaction.del(staleKeys);
  transaction.hSet(saleKeys.sale(saleId), { startsAt, endsAt, stock });
  await transaction.exec();
}

async function main() {
  const config = loadConfig(process.env);
  const saleConfig = loadSaleConfig(process.env);

  const mongo = createMongoClient(config.dbUrl);
  const redis = createRedisClient(config.redisUrl, console.error);
  try {
    await Promise.all([mongo.connect(), redis.connect()]);
    const db = mongo.db();
    await ensurePurchaseIndexes(db);

    await createSale(db, redis, saleConfig);
    console.log(
      `created sale ${saleConfig.saleId} with ${saleConfig.stock} items: ` +
        `${new Date(saleConfig.startsAt).toISOString()} to ${new Date(saleConfig.endsAt).toISOString()}`,
    );

    await new RedisPurchaseStream(redis).ensureConsumerGroup(saleConfig.saleId);
  } finally {
    await mongo.close();
    await redis.close().catch(() => redis.destroy());
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
