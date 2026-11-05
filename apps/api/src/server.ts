import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createMongoClient } from "./db.js";

async function main() {
  const config = loadConfig(process.env);

  const mongo = createMongoClient(config.dbUrl);
  await mongo.connect();
  // const db = mongo.db();

  const app = buildApp({ logger: true });
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
