import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createMongoClient } from "./db.js";
import { MongoSalesRepository } from "./repositories/sales.repository.js";
import { SalesService } from "./services/sales.service.js";

async function main() {
  const config = loadConfig(process.env);

  const mongo = createMongoClient(config.dbUrl);
  const db = mongo.db();

  const salesService = new SalesService(new MongoSalesRepository(db));
  const app = buildApp({ salesService }, { logger: true });
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await mongo.close();
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));

  try {
    await mongo.connect();
    app.log.info("connected to MongoDB");
    await app.listen({ port: config.port });
  } catch (err) {
    app.log.fatal({ err }, "failed to start");
    await mongo.close().catch(() => {});
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
