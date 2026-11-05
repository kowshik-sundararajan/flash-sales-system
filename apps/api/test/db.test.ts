import { expect, test } from "vitest";
import { createMongoClient } from "../src/db.js";

test("fails fast (within 2000ms) when MongoDB is unreachable", async () => {
  const client = createMongoClient("mongodb://127.0.0.1:1/ecommerce", 300);
  const startedAt = Date.now();

  await expect(client.connect()).rejects.toThrow();

  expect(Date.now() - startedAt).toBeLessThan(2000);
  await client.close();
});
