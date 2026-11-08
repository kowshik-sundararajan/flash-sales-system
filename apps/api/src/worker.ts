import { hostname } from "node:os";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createMongoClient, createRedisClient } from "./bootstrap.js";
import {
  ensurePurchaseIndexes,
  MongoPurchasesRepository,
} from "./repositories/purchases.repository.js";
import { RedisPurchaseStream } from "./repositories/purchaseStream.repository.js";
import { MongoSalesRepository } from "./repositories/sales.repository.js";
import { saleIdSchema } from "./schemas/sale.schema.js";
import { PurchaseSyncService } from "./services/purchaseSync.service.js";

const logger = createLogger("worker", process.env.LOG_LEVEL);

const RETRY_DELAY_MS = 1_000;

async function main() {
  const config = loadConfig(process.env);
  const saleId = saleIdSchema.parse(process.env.SALE_ID); // this would be loaded from DB to support multiple sales
  const consumer = process.env.WORKER_ID?.trim() || hostname(); // unique per worker
  const log = logger.child({ consumer, saleId });

  const mongo = createMongoClient(config.dbUrl);
  const redis = createRedisClient(config.redisUrl, (error) =>
    log.error({ error }, "redis error"),
  );
  const abort = new AbortController();
  const stop = (signal: string) => {
    log.info({ signal }, "stopping after the current batch");
    abort.abort();
  };
  process.once("SIGTERM", () => stop("SIGTERM"));
  process.once("SIGINT", () => stop("SIGINT"));

  try {
    await Promise.all([mongo.connect(), redis.connect()]);
    const db = mongo.db();
    await ensurePurchaseIndexes(db);

    const purchaseStream = new RedisPurchaseStream(redis);
    await purchaseStream.ensureConsumerGroup(saleId);

    const purchasesRepository = new MongoPurchasesRepository(db);
    const salesRepository = new MongoSalesRepository(db);

    const sync = new PurchaseSyncService(
      purchaseStream,
      purchasesRepository,
      salesRepository,
      consumer,
      (_saleId, entry, reason) =>
        log.error(
          { entryId: entry.id, reason },
          "stream entry added to dead-letter",
        ),
    );

    log.info("syncing purchases");

    while (!abort.signal.aborted) {
      try {
        const numSyncedEntries = await sync.syncBatch(saleId);
        if (numSyncedEntries > 0)
          log.info({ numSyncedEntries }, "synced batch");
      } catch (error) {
        // The batch stays unacknowledged, so it is retried after a pause.
        log.error({ error, retryInMs: RETRY_DELAY_MS }, "sync failed");

        if (isMissingConsumerGroup(error)) {
          await purchaseStream
            .ensureConsumerGroup(saleId)
            .catch((groupError) =>
              log.error({ error: groupError }, "could not recreate the group"),
            );
        }

        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  } finally {
    await Promise.allSettled([
      mongo.close(),
      redis.close().catch(() => redis.destroy()),
    ]);
  }
}

const isMissingConsumerGroup = (error: unknown) =>
  error instanceof Error && error.message.includes("NOGROUP");

main().catch((error) => {
  logger.fatal({ error }, "worker failed to start or crashed");
  process.exit(1);
});
