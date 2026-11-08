import { describe, expect, test, vi } from "vitest";
import type { RedisClient } from "../../src/bootstrap.js";
import {
  PURCHASE_SYNC_GROUP,
  RedisPurchaseStream,
} from "../../src/repositories/purchaseStream.repository.js";
import { SALE_ID, USER_ID } from "../fixtures.js";

const STREAM_KEY = `{sale:${SALE_ID}}:purchases`;
const CONSUMER = "worker-1";
const PURCHASED_AT = "1700000000123";

function streamOf(
  redis: Partial<Record<keyof RedisClient, unknown>>,
  blockMs = 2_000,
  claimIdleMs = 10_000,
) {
  return new RedisPurchaseStream(
    redis as unknown as RedisClient,
    blockMs,
    claimIdleMs,
  );
}

function fakeMulti(exec: ReturnType<typeof vi.fn>) {
  const chain = {
    xAck: vi.fn().mockReturnThis(),
    xDel: vi.fn().mockReturnThis(),
    exec,
  };
  return { multi: vi.fn().mockReturnValue(chain), chain };
}

describe("RedisPurchaseStream", () => {
  describe("readBatch", () => {
    const NO_ENTRIES = null; // XREADGROUP timing out
    const replyOf = (...messages: { id: string; message: object }[]) => [
      { name: STREAM_KEY, messages },
    ];

    test("reads new entries (>), blocking, claiming ones left idle too long", async () => {
      const xReadGroup = vi.fn().mockResolvedValue(NO_ENTRIES);

      await streamOf({ xReadGroup }, 750, 12_000).readBatch(SALE_ID, CONSUMER);

      expect(xReadGroup).toHaveBeenCalledExactlyOnceWith(
        PURCHASE_SYNC_GROUP,
        CONSUMER,
        { key: STREAM_KEY, id: ">" },
        { COUNT: 500, BLOCK: 750, CLAIM: 12_000 },
      );
    });

    test("turns the reply into entries with their fields", async () => {
      const xReadGroup = vi.fn().mockResolvedValue(
        replyOf(
          {
            id: "1-0",
            message: {
              saleId: SALE_ID,
              userId: USER_ID,
              purchasedAt: PURCHASED_AT,
            },
          },
          { id: "2-0", message: { saleId: SALE_ID, userId: "janedoe30" } },
        ),
      );

      const entries = await streamOf({ xReadGroup }).readBatch(
        SALE_ID,
        CONSUMER,
      );

      expect(entries).toStrictEqual([
        {
          id: "1-0",
          fields: {
            saleId: SALE_ID,
            userId: USER_ID,
            purchasedAt: PURCHASED_AT,
          },
        },
        { id: "2-0", fields: { saleId: SALE_ID, userId: "janedoe30" } },
      ]);
    });

    test("claimed entries come back like any other", async () => {
      const xReadGroup = vi.fn().mockResolvedValue(
        replyOf({
          id: "3-0",
          message: { saleId: SALE_ID, userId: USER_ID },
          // node-redis adds these for claimed entries
          millisElapsedFromDelivery: 31_000,
          deliveriesCounter: 2,
        } as never),
      );

      const entries = await streamOf({ xReadGroup }).readBatch(
        SALE_ID,
        CONSUMER,
      );

      expect(entries).toStrictEqual([
        { id: "3-0", fields: { saleId: SALE_ID, userId: USER_ID } },
      ]);
    });

    test("returns no entries when the read times out (null reply)", async () => {
      const xReadGroup = vi.fn().mockResolvedValue(NO_ENTRIES);

      await expect(
        streamOf({ xReadGroup }).readBatch(SALE_ID, CONSUMER),
      ).resolves.toStrictEqual([]);
    });
  });

  describe("deadLetter", () => {
    function fakeDeadLetterMulti(exec: ReturnType<typeof vi.fn>) {
      const chain = { xAdd: vi.fn().mockReturnThis(), exec };
      return { multi: vi.fn().mockReturnValue(chain), chain };
    }

    test("parks each entry, with its id, the reason and its original fields, in one transaction", async () => {
      const { multi, chain } = fakeDeadLetterMulti(
        vi.fn().mockResolvedValue(["9-0"]),
      );

      await streamOf({ multi }).deadLetter(SALE_ID, [
        {
          entry: { id: "1-0", fields: { userId: "no good!" } },
          reason: "userId: Invalid string",
        },
      ]);

      expect(chain.xAdd).toHaveBeenCalledExactlyOnceWith(
        `${STREAM_KEY}:dead`,
        "*",
        {
          entryId: "1-0",
          reason: "userId: Invalid string",
          fields: JSON.stringify({ userId: "no good!" }),
        },
      );
      expect(chain.exec).toHaveBeenCalledOnce();
    });

    test("does nothing when there is nothing to park", async () => {
      const multi = vi.fn();

      await streamOf({ multi }).deadLetter(SALE_ID, []);

      expect(multi).not.toHaveBeenCalled();
    });

    test("throws if the transaction fails", async () => {
      const failure = new Error("OOM");
      const { multi } = fakeDeadLetterMulti(vi.fn().mockRejectedValue(failure));

      await expect(
        streamOf({ multi }).deadLetter(SALE_ID, [
          { entry: { id: "1-0", fields: {} }, reason: "bad" },
        ]),
      ).rejects.toMatchObject({
        message: "failed to dead-letter stream entries",
        cause: failure,
      });
    });
  });

  describe("ensureConsumerGroup", () => {
    test("creates the group from the start of the stream, creating the stream if needed", async () => {
      const xGroupCreate = vi.fn().mockResolvedValue("OK");

      await streamOf({ xGroupCreate }).ensureConsumerGroup(SALE_ID);

      expect(xGroupCreate).toHaveBeenCalledExactlyOnceWith(
        STREAM_KEY,
        PURCHASE_SYNC_GROUP,
        "0",
        { MKSTREAM: true },
      );
    });

    test("is fine when the group already exists", async () => {
      const xGroupCreate = vi
        .fn()
        .mockRejectedValue(
          new Error("BUSYGROUP Consumer Group name already exists"),
        );

      await expect(
        streamOf({ xGroupCreate }).ensureConsumerGroup(SALE_ID),
      ).resolves.toBeUndefined();
    });

    test("rethrows other Redis errors", async () => {
      const error = new Error("READONLY");
      const xGroupCreate = vi.fn().mockRejectedValue(error);

      await expect(
        streamOf({ xGroupCreate }).ensureConsumerGroup(SALE_ID),
      ).rejects.toBe(error);
    });
  });

  test("readBatch rethrows Redis errors, including a missing group", async () => {
    const error = new Error("NOGROUP No such key or consumer group");
    const xReadGroup = vi.fn().mockRejectedValue(error);

    await expect(
      streamOf({ xReadGroup }).readBatch(SALE_ID, CONSUMER),
    ).rejects.toBe(error);
  });

  describe("ack", () => {
    test("acknowledges and deletes the entries in one transaction", async () => {
      const exec = vi.fn().mockResolvedValue([2, 2]);
      const { multi, chain } = fakeMulti(exec);

      await streamOf({ multi }).ack(SALE_ID, ["1-0", "2-0"]);

      expect(chain.xAck).toHaveBeenCalledWith(STREAM_KEY, PURCHASE_SYNC_GROUP, [
        "1-0",
        "2-0",
      ]);
      expect(chain.xDel).toHaveBeenCalledWith(STREAM_KEY, ["1-0", "2-0"]);
      expect(exec).toHaveBeenCalledOnce();
    });

    test("throws if the transaction fails", async () => {
      const cause = new Error("READONLY");
      const { multi } = fakeMulti(vi.fn().mockRejectedValue(cause));

      await expect(
        streamOf({ multi }).ack(SALE_ID, ["1-0"]),
      ).rejects.toMatchObject({
        message: "failed to ack purchase stream entries",
        cause,
      });
    });
  });
});
