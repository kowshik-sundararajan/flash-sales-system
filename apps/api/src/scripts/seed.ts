import type { Redis } from "ioredis";
import { loadConfig } from "../config.js";
import { createMongoClient, createRedisClient } from "../bootstrap.js";
import type { Sale } from "../models/sale.model.js";
import {
  ensurePurchaseIndexes,
  PURCHASES_COLLECTION_NAME,
  saleKeys,
} from "../repositories/purchases.repository.js";
import {
  SALES_COLLECTION_NAME,
  type SaleDocument,
} from "../repositories/sales.repository.js";

async function seedRedisSale(
  redis: Redis,
  sale: Pick<Sale, "id" | "startsAt" | "endsAt" | "stock">,
): Promise<void> {
  const stale: string[] = [];
  for await (const keys of redis.scanStream({
    match: saleKeys.all(sale.id),
    count: 100,
  })) {
    stale.push(...(keys as string[]));
  }

  const tx = redis.multi();
  if (stale.length > 0) tx.del(...stale);
  tx.hset(saleKeys.sale(sale.id), {
    startsAt: sale.startsAt,
    endsAt: sale.endsAt,
    stock: sale.stock.remaining,
  });

  const results = await tx.exec();
  const failed = results?.find(([err]) => err);
  if (!results || failed) {
    throw new Error("failed to seed sale in Redis", { cause: failed?.[0] });
  }
}

async function main() {
  const config = loadConfig(process.env);
  const startsInSeconds = 60;
  const durationSeconds = 3600;

  const startsAt = Date.now() + startsInSeconds * 1000;
  const sale: SaleDocument = {
    _id: "8f3c1d2e-5a4b-4c6d-9e7f-1a2b3c4d5e6f",
    product: { id: "product-1", name: "Best Headphones" },
    stock: { initial: 100, remaining: 100 },
    startsAt,
    endsAt: startsAt + durationSeconds * 1000,
  };

  const mongo = createMongoClient(config.dbUrl);
  const redis = createRedisClient(config.redisUrl, 5_000);
  try {
    await Promise.all([mongo.connect(), redis.connect()]);
    const db = mongo.db();
    await db
      .collection<SaleDocument>(SALES_COLLECTION_NAME)
      .replaceOne({ _id: sale._id }, sale, { upsert: true });
    await ensurePurchaseIndexes(db);
    await db
      .collection(PURCHASES_COLLECTION_NAME)
      .deleteMany({ saleId: sale._id });
    await seedRedisSale(redis, { ...sale, id: sale._id });
    console.log(
      `seeded ${sale._id} (Mongo + Redis): ${new Date(sale.startsAt).toISOString()} to ${new Date(sale.endsAt).toISOString()}`,
    );
  } finally {
    await mongo.close();
    await redis.quit().catch(() => redis.disconnect());
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
