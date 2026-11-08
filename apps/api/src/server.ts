import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createMongoClient, createRedisClient } from "./bootstrap.js";
import { MongoSalesRepository } from "./repositories/sales.repository.js";
import { SalesService } from "./services/sales.service.js";
import { PurchasesService } from "./services/purchases.service.js";
import { RedisPurchasesRepository } from "./repositories/purchases.repository.js";
import { createLogger } from "./logger.js";
import { withTimeout } from "./lib/withTimeout.js";

const logger = createLogger("api", process.env.LOG_LEVEL);

const HEALTH_TIMEOUT_MS = 1_000;

async function main() {
  const config = loadConfig(process.env);

  const mongo = createMongoClient(config.dbUrl);
  const db = mongo.db();

  const redis = createRedisClient(config.redisUrl, (err) =>
    logger.error({ err }, "redis error"),
  );

  const salesService = new SalesService(new MongoSalesRepository(db));
  const purchasesService = new PurchasesService(
    new RedisPurchasesRepository(redis),
  );

  const checkDependencies = async () => {
    await Promise.all([
      withTimeout(redis.ping(), HEALTH_TIMEOUT_MS),
      withTimeout(mongo.db().command({ ping: 1 }), HEALTH_TIMEOUT_MS),
    ]);
  };

  const app = buildApp(
    { salesService, purchasesService, checkDependencies },
    { loggerInstance: logger },
  );

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    const results = await Promise.allSettled([
      mongo.close(),
      redis.close().catch(() => redis.destroy()),
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
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    app.log.fatal({ err }, "failed to start");
    await mongo.close().catch(() => {});
    await redis.close().catch(() => redis.destroy());
    process.exit(1);
  }
}

main().catch((err) => {
  logger.fatal({ err }, "api crashed");
  process.exit(1);
});
