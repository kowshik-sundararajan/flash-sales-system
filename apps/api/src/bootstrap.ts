import { Redis } from "ioredis";
import { MongoClient } from "mongodb";

export function createMongoClient(
  url: string,
  timeoutMs: number = 2_000,
): MongoClient {
  return new MongoClient(url, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: timeoutMs,
    connectTimeoutMS: timeoutMs,
    writeConcern: { w: "majority", journal: true },
  });
}

export function createRedisClient(url: string, timeoutMs = 200): Redis {
  return new Redis(url, {
    lazyConnect: true,
    commandTimeout: timeoutMs,
    connectTimeout: 1_000,
    enableOfflineQueue: false,
  });
}
