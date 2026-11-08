import { createClient } from "redis";
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

export function createRedisClient(
  url: string,
  onError: (error: Error) => void,
  connectTimeoutMs = 1_000,
) {
  let everConnected = false;
  const client = createClient({
    url,
    disableOfflineQueue: true, // fail fast while disconnected instead of queueing
    socket: {
      connectTimeout: connectTimeoutMs,
      // Fail fast if Redis is unreachable at startup, but once we have been
      // connected, keep reconnecting with a capped backoff.
      reconnectStrategy: (retries, cause) =>
        everConnected ? Math.min(retries * 50, 1_000) : cause,
    },
  });

  client.on("error", onError);

  client.once("ready", () => {
    everConnected = true;
  });

  return client;
}

export type RedisClient = ReturnType<typeof createRedisClient>;
