import { hostname } from "node:os";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createMongoClient, createRedisClient } from "../src/bootstrap.js";
import { SALE_ID } from "./fixtures.js";

/**
 * worker.ts starts itself when imported, so each test mocks what it talks to
 * (the database clients, the repositories, the sync service and the logger),
 * imports the real file, and drives it with process signals.
 */
const h = vi.hoisted(() => {
  const log = {
    info: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  };
  return {
    log,
    mongo: { connect: vi.fn(), db: vi.fn(), close: vi.fn() },
    redis: { connect: vi.fn(), close: vi.fn(), destroy: vi.fn() },
    ensurePurchaseIndexes: vi.fn(),
    ensureConsumerGroup: vi.fn(),
    syncBatch: vi.fn(),
    serviceArgs: [] as unknown[][],
  };
});

vi.mock("../src/logger.js", () => ({ createLogger: vi.fn(() => h.log) }));
vi.mock("../src/bootstrap.js", () => ({
  createMongoClient: vi.fn(() => h.mongo),
  createRedisClient: vi.fn(() => h.redis),
}));
vi.mock("../src/repositories/purchases.repository.js", async (original) => ({
  ...(await original<object>()),
  ensurePurchaseIndexes: h.ensurePurchaseIndexes,
  MongoPurchasesRepository: class {},
}));
vi.mock("../src/repositories/purchaseStream.repository.js", () => ({
  RedisPurchaseStream: class {
    ensureConsumerGroup = h.ensureConsumerGroup;
  },
}));
vi.mock("../src/repositories/sales.repository.js", () => ({
  MongoSalesRepository: class {},
}));
vi.mock("../src/services/purchaseSync.service.js", () => ({
  PurchaseSyncService: class {
    constructor(...args: unknown[]) {
      h.serviceArgs.push(args);
    }
    syncBatch = h.syncBatch;
  },
}));

const DB = { name: "db" };
const ENV_KEYS = ["DB_URL", "REDIS_URL", "SALE_ID", "WORKER_ID", "LOG_LEVEL"];
const savedEnv = new Map<string, string | undefined>();
let newSignalListeners: [string, (...args: unknown[]) => void][] = [];
let exitSpy: ReturnType<typeof vi.spyOn>;

function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function startWorker() {
  vi.resetModules();
  const before = new Map(
    ["SIGTERM", "SIGINT"].map((signal) => [
      signal,
      process.listeners(signal as "SIGTERM"),
    ]),
  );
  await import("../src/worker.js");
  newSignalListeners = ["SIGTERM", "SIGINT"].flatMap((signal) =>
    process
      .listeners(signal as "SIGTERM")
      .filter((fn) => !before.get(signal)!.includes(fn))
      .map((fn) => [signal, fn] as [string, (...args: unknown[]) => void]),
  );
}

/** Lets the worker's chain of awaited mocks run, without moving the clock. */
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

/** The next syncBatch calls return `counts` in turn, then the nth one asks the worker to stop. */
function syncReturning(
  counts: number[],
  signal: "SIGTERM" | "SIGINT" = "SIGTERM",
) {
  let call = 0;
  h.syncBatch.mockImplementation(async () => {
    call++;
    // fail loudly if the worker never stops, instead of spinning forever
    if (call > counts.length + 3) throw new Error("the worker did not stop");
    if (call >= counts.length) process.emit(signal);
    return counts[call - 1] ?? 0;
  });
}

const closed = () => vi.waitFor(() => expect(h.mongo.close).toHaveBeenCalled());

beforeEach(() => {
  vi.clearAllMocks();
  h.serviceArgs.length = 0;
  h.log.child.mockReturnValue(h.log);
  h.mongo.connect.mockResolvedValue(undefined);
  h.mongo.db.mockReturnValue(DB);
  h.mongo.close.mockResolvedValue(undefined);
  h.redis.connect.mockResolvedValue(undefined);
  h.redis.close.mockResolvedValue(undefined);
  h.ensurePurchaseIndexes.mockResolvedValue(undefined);
  h.ensureConsumerGroup.mockResolvedValue(undefined);
  // by default the worker stops after one batch, so a broken test cannot spin forever
  syncReturning([0]);
  exitSpy = vi
    .spyOn(process, "exit")
    .mockImplementation((() => undefined) as never);
  for (const key of ENV_KEYS) savedEnv.set(key, process.env[key]);
  setEnv({
    DB_URL: "mongodb://db/test",
    REDIS_URL: "redis://cache:6379",
    SALE_ID,
    WORKER_ID: undefined,
    LOG_LEVEL: undefined,
  });
});

afterEach(() => {
  vi.useRealTimers();
  exitSpy.mockRestore();
  for (const [signal, fn] of newSignalListeners) {
    process.removeListener(signal as "SIGTERM", fn);
  }
  newSignalListeners = [];
  setEnv(Object.fromEntries(savedEnv));
});

describe("worker", () => {
  describe("syncing", () => {
    test("syncs the configured sale until it is stopped, then closes both connections", async () => {
      syncReturning([0, 0, 0]);

      await startWorker();
      await closed();

      expect(h.syncBatch).toHaveBeenCalledTimes(3);
      expect(h.syncBatch).toHaveBeenCalledWith(SALE_ID);
      expect(h.mongo.connect).toHaveBeenCalledOnce();
      expect(h.redis.connect).toHaveBeenCalledOnce();
      expect(h.redis.close).toHaveBeenCalledOnce();
      expect(exitSpy).not.toHaveBeenCalled();
    });

    test("creates the unique indexes before the first batch", async () => {
      syncReturning([0]);

      await startWorker();
      await closed();

      expect(h.ensurePurchaseIndexes).toHaveBeenCalledWith(DB);
      expect(h.ensurePurchaseIndexes.mock.invocationCallOrder[0]).toBeLessThan(
        h.syncBatch.mock.invocationCallOrder[0]!,
      );
    });

    test("ensures the consumer group for its sale before the first batch", async () => {
      syncReturning([0]);

      await startWorker();
      await closed();

      expect(h.ensureConsumerGroup).toHaveBeenCalledWith(SALE_ID);
      expect(h.ensureConsumerGroup.mock.invocationCallOrder[0]).toBeLessThan(
        h.syncBatch.mock.invocationCallOrder[0]!,
      );
    });

    test("logs Redis connection errors instead of crashing on them", async () => {
      syncReturning([0]);

      await startWorker();
      await closed();

      expect(createRedisClient).toHaveBeenCalledWith(
        "redis://cache:6379",
        expect.any(Function),
      );
      const onError = vi.mocked(createRedisClient).mock.calls[0]![1];
      const error = new Error("ECONNRESET");
      onError(error);

      expect(h.log.error).toHaveBeenCalledWith({ error }, "redis error");
    });

    test("logs a batch with the number of entries, and stays quiet when idle", async () => {
      syncReturning([5, 0, 2]);

      await startWorker();
      await closed();

      const batches = h.log.info.mock.calls.filter(
        ([, message]) => message === "synced batch",
      );
      expect(batches).toStrictEqual([
        [{ numSyncedEntries: 5 }, "synced batch"],
        [{ numSyncedEntries: 2 }, "synced batch"],
      ]);
    });
  });

  describe("who the worker is", () => {
    test("uses WORKER_ID, trimmed, as its consumer name", async () => {
      setEnv({ WORKER_ID: "  worker-a  " });
      syncReturning([0]);

      await startWorker();
      await closed();

      expect(h.serviceArgs[0]![3]).toBe("worker-a");
      expect(h.log.child).toHaveBeenCalledWith({
        consumer: "worker-a",
        saleId: SALE_ID,
      });
    });

    test.each([
      { name: "unset", value: undefined },
      { name: "blank", value: "   " },
    ])(
      "falls back to the hostname when WORKER_ID is $name",
      async ({ value }) => {
        setEnv({ WORKER_ID: value });
        syncReturning([0]);

        await startWorker();
        await closed();

        expect(h.serviceArgs[0]![3]).toBe(hostname());
      },
    );

    test("the saleId it logs and syncs is the normalized one", async () => {
      setEnv({ SALE_ID: `  ${SALE_ID.toUpperCase()}  ` });
      syncReturning([0]);

      await startWorker();
      await closed();

      expect(h.syncBatch).toHaveBeenCalledWith(SALE_ID);
    });
  });

  describe("stopping", () => {
    test.each(["SIGTERM", "SIGINT"] as const)(
      "stops after the current batch on %s",
      async (signal) => {
        syncReturning([1, 0], signal);

        await startWorker();
        await closed();

        expect(h.syncBatch).toHaveBeenCalledTimes(2);
        expect(h.log.info).toHaveBeenCalledWith(
          { signal },
          "stopping after the current batch",
        );
      },
    );

    test("closes the connections even when the loop cannot start", async () => {
      h.ensurePurchaseIndexes.mockRejectedValue(
        new Error("index build failed"),
      );

      await startWorker();
      await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(1));

      expect(h.mongo.close).toHaveBeenCalledOnce();
      expect(h.redis.close).toHaveBeenCalledOnce();
      expect(h.syncBatch).not.toHaveBeenCalled();
    });

    test("falls back to destroying the connection when Redis does not close cleanly", async () => {
      h.redis.close.mockRejectedValue(new Error("connection lost"));
      syncReturning([0]);

      await startWorker();
      await closed();

      await vi.waitFor(() => expect(h.redis.destroy).toHaveBeenCalledOnce());
    });
  });

  describe("when a batch fails", () => {
    test("logs the error, waits a second, and tries again", async () => {
      vi.useFakeTimers();
      const error = new Error("mongo down");
      h.syncBatch.mockRejectedValueOnce(error).mockImplementation(async () => {
        process.emit("SIGTERM");
        return 0;
      });

      await startWorker();
      await flush();

      expect(h.syncBatch).toHaveBeenCalledTimes(1);
      expect(h.log.error).toHaveBeenCalledWith(
        { error, retryInMs: 1_000 },
        "sync failed",
      );

      await vi.advanceTimersByTimeAsync(999);
      expect(h.syncBatch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(h.syncBatch).toHaveBeenCalledTimes(2);
      await flush();
      expect(h.mongo.close).toHaveBeenCalledOnce();
      expect(exitSpy).not.toHaveBeenCalled();
    });

    test("recreates the consumer group when Redis lost it, then carries on", async () => {
      vi.useFakeTimers();
      const lost = new Error("NOGROUP No such key or consumer group");
      h.syncBatch.mockRejectedValueOnce(lost).mockImplementation(async () => {
        process.emit("SIGTERM");
        return 0;
      });

      await startWorker();
      await flush();

      expect(h.ensureConsumerGroup).toHaveBeenCalledTimes(2); // at startup, then again
      expect(h.ensureConsumerGroup).toHaveBeenLastCalledWith(SALE_ID);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(h.syncBatch).toHaveBeenCalledTimes(2);
    });

    test("does not touch the consumer group after other failures", async () => {
      vi.useFakeTimers();
      h.syncBatch
        .mockRejectedValueOnce(new Error("mongo down"))
        .mockImplementation(async () => {
          process.emit("SIGTERM");
          return 0;
        });

      await startWorker();
      await flush();

      expect(h.ensureConsumerGroup).toHaveBeenCalledTimes(1); // only at startup
    });

    test("does not wait after a batch that succeeds", async () => {
      vi.useFakeTimers();
      syncReturning([3, 2, 0]);

      await startWorker();
      await flush();

      expect(h.syncBatch).toHaveBeenCalledTimes(3);
      expect(h.mongo.close).toHaveBeenCalledOnce();
    });

    test("reports a dead-lettered entry with its id and reason", async () => {
      syncReturning([0]);
      await startWorker();
      await closed();

      const onDeadLetter = h.serviceArgs[0]![4] as (
        saleId: string,
        entry: { id: string; fields: Record<string, string> },
        reason: string,
      ) => void;
      onDeadLetter(SALE_ID, { id: "9-0", fields: {} }, "userId: bad");

      expect(h.log.error).toHaveBeenCalledWith(
        { entryId: "9-0", reason: "userId: bad" },
        "stream entry added to dead-letter",
      );
    });
  });

  describe("starting up with bad configuration", () => {
    test.each([
      { name: "SALE_ID is missing", env: { SALE_ID: undefined } },
      { name: "SALE_ID is not a UUID", env: { SALE_ID: "not-a-uuid" } },
      { name: "DB_URL is missing", env: { DB_URL: undefined } },
      { name: "REDIS_URL is missing", env: { REDIS_URL: undefined } },
    ])("exits with 1 without connecting when $name", async ({ env }) => {
      setEnv(env);

      await startWorker();
      await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(1));

      expect(h.log.fatal).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        "worker failed to start or crashed",
      );
      expect(createMongoClient).not.toHaveBeenCalled();
      expect(h.mongo.connect).not.toHaveBeenCalled();
      expect(h.syncBatch).not.toHaveBeenCalled();
    });

    test("exits with 1 when a database cannot be reached", async () => {
      h.mongo.connect.mockRejectedValue(new Error("no mongo"));

      await startWorker();
      await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(1));

      expect(h.log.fatal).toHaveBeenCalledOnce();
      expect(h.mongo.close).toHaveBeenCalledOnce();
      expect(h.syncBatch).not.toHaveBeenCalled();
    });
  });
});
