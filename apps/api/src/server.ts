import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createMongoClient, createRedisClient } from "./bootstrap.js";
import { MongoSalesRepository } from "./repositories/sales.repository.js";
import { SalesService } from "./services/sales.service.js";
import { PurchasesService } from "./services/purchases.service.js";
import { RedisPurchasesRepository } from "./repositories/purchases.repository.js";

async function main() {
  const config = loadConfig(process.env);

  const mongo = createMongoClient(config.dbUrl);
  const db = mongo.db();

  const redis = createRedisClient(config.redisUrl);

  const salesService = new SalesService(new MongoSalesRepository(db));
  const purchasesService = new PurchasesService(
    new RedisPurchasesRepository(redis),
  );

  const app = buildApp({ salesService, purchasesService }, { logger: true });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    const results = await Promise.allSettled([
      mongo.close(),
      redis.quit().catch(() => redis.disconnect()),
    ]);
    for (const result of results) {
      if (result.status === "rejected") {
        app.log.error({ err: result.reason }, "error closing connection");
      }
    }
    app.log.info("shutdown complete");
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));

  try {
    await mongo.connect();
    app.log.info("connected to MongoDB");
    await redis.connect();
    app.log.info("connected to Redis");
    await app.listen({ port: config.port });
  } catch (err) {
    app.log.fatal({ err }, "failed to start");
    await mongo.close().catch(() => {});
    await redis.quit().catch(() => redis.disconnect());
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
