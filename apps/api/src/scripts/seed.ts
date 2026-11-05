import { loadConfig } from "../config.js";
import { createMongoClient } from "../bootstrap.js";
import {
  SALES_COLLECTION_NAME,
  type SaleDocument,
} from "../repositories/sales.repository.js";

async function main() {
  const config = loadConfig(process.env);
  const startsInSeconds = 60;
  const durationSeconds = 3600;

  const startsAt = Date.now() + startsInSeconds * 1000;
  const sale: SaleDocument = {
    _id: "sale-1",
    product: { id: "product-1", name: "Best Headphones" },
    stock: 100,
    perUserLimit: 1,
    startsAt,
    endsAt: startsAt + durationSeconds * 1000,
  };

  const mongo = createMongoClient(config.dbUrl);
  try {
    await mongo.connect();
    await mongo
      .db()
      .collection<SaleDocument>(SALES_COLLECTION_NAME)
      .replaceOne({ _id: sale._id }, sale, { upsert: true });
    console.log(
      `seeded ${sale._id}: ${new Date(sale.startsAt).toISOString()} to ${new Date(sale.endsAt).toISOString()}`,
    );
  } finally {
    await mongo.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
