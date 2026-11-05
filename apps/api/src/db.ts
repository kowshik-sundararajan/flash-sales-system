import { MongoClient } from "mongodb";

export function createMongoClient(url: string, timeoutMs = 2000): MongoClient {
  return new MongoClient(url, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: timeoutMs,
    connectTimeoutMS: timeoutMs,
    writeConcern: { w: "majority", journal: true },
  });
}
