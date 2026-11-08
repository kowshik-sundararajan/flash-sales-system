import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { GenericContainer } from "testcontainers";
import type { TestProject } from "vitest/node";
import { buildApp } from "../../src/app.js";
import {
  createMongoClient,
  createRedisClient,
  type RedisClient,
} from "../../src/bootstrap.js";
import {
  ensurePurchaseIndexes,
  MongoPurchasesRepository,
  RedisPurchasesRepository,
  saleKeys,
} from "../../src/repositories/purchases.repository.js";
import { RedisPurchaseStream } from "../../src/repositories/purchaseStream.repository.js";
import {
  MongoSalesRepository,
  SALES_COLLECTION_NAME,
  type SaleDocument,
} from "../../src/repositories/sales.repository.js";
import { saleIdSchema } from "../../src/schemas/sale.schema.js";
import { PurchasesService } from "../../src/services/purchases.service.js";
import { PurchaseSyncService } from "../../src/services/purchaseSync.service.js";
import { SalesService } from "../../src/services/sales.service.js";

declare module "vitest" {
  export interface ProvidedContext {
    apiUrl: string;
    mongoUrl: string;
    redisUrl: string;
    sales: { live: string; rush: string; upcoming: string; ended: string };
  }
}

export default async function setup(project: TestProject) {
  let mongoContainer, redisContainer;
  try {
    [mongoContainer, redisContainer] = await Promise.all([
      new GenericContainer("mongo:9.0.4").withExposedPorts(27017).start(),
      new GenericContainer("redis:8.10.3").withExposedPorts(6379).start(),
    ]);
  } catch (cause) {
    throw new Error(
      "Integration tests start their own Mongo and Redis with Docker. Start Docker and run them again.",
      { cause },
    );
  }

  const mongoUrl = `mongodb://${mongoContainer.getHost()}:${mongoContainer.getMappedPort(27017)}/test`;
  const mongo = createMongoClient(mongoUrl);
  const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
  const redisClients: RedisClient[] = [];
  async function connectRedis() {
    const client = createRedisClient(redisUrl, () => {});
    await client.connect();
    redisClients.push(client);
    return client;
  }
  await mongo.connect();
  const redis = await connectRedis();
  const db = mongo.db();
  await ensurePurchaseIndexes(db);

  const salesRepository = new MongoSalesRepository(db);
  const purchasesRepository = new MongoPurchasesRepository(db);
  const stream = new RedisPurchaseStream(redis, 50, 200);

  async function createSale(
    stock: number,
    opensInMs: number,
    closesInMs: number,
  ) {
    const saleId = saleIdSchema.parse(randomUUID());
    const startsAt = Date.now() + opensInMs;
    const endsAt = Date.now() + closesInMs;
    await db.collection<SaleDocument>(SALES_COLLECTION_NAME).insertOne({
      _id: saleId,
      product: { id: "product-1", name: "Best Headphones" },
      stock: { initial: stock, remaining: stock },
      startsAt,
      endsAt,
    });
    await redis.hSet(saleKeys.sale(saleId), { startsAt, endsAt, stock });
    await stream.ensureConsumerGroup(saleId);
    return saleId;
  }
  const sales = {
    live: await createSale(100, -1_000, 600_000),
    rush: await createSale(25, -1_000, 600_000),
    upcoming: await createSale(10, 600_000, 1_200_000),
    ended: await createSale(10, -1_200_000, -600_000),
  };

  const apiRedis = await connectRedis();
  const app = buildApp({
    salesService: new SalesService(salesRepository),
    purchasesService: new PurchasesService(
      new RedisPurchasesRepository(apiRedis, 5_000),
    ),
    checkDependencies: async () => {
      await Promise.all([apiRedis.ping(), db.command({ ping: 1 })]);
    },
  });
  const apiUrl = await app.listen({ host: "127.0.0.1", port: 0 });

  let running = true;
  const workers = ["worker-1", "worker-2"].map(async (name) => {
    const workerStream = new RedisPurchaseStream(await connectRedis(), 50, 200);
    const sync = new PurchaseSyncService(
      workerStream,
      purchasesRepository,
      salesRepository,
      name,
    );
    while (running) {
      for (const saleId of [sales.live, sales.rush]) {
        await sync.syncBatch(saleId).catch(() => sleep(100));
      }
    }
  });

  project.provide("apiUrl", apiUrl);
  project.provide("mongoUrl", mongoUrl);
  project.provide("redisUrl", redisUrl);
  project.provide("sales", sales);

  return async () => {
    running = false;
    await Promise.all(workers);
    await app.close();
    await mongo.close();
    redisClients.forEach((client) => client.destroy());
    await Promise.all([mongoContainer.stop(), redisContainer.stop()]);
  };
}
