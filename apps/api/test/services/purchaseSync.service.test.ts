import { describe, expect, test, vi } from "vitest";
import type { StreamEntry } from "../../src/repositories/purchaseStream.repository.js";
import { PurchaseSyncService } from "../../src/services/purchaseSync.service.js";
import { OTHER_USER_ID, SALE_ID, USER_ID } from "../fixtures.js";

const CONSUMER = "worker-1";
const PURCHASED_AT = 1_700_000_000_123;

function entryOf(id: string, userId: string = USER_ID): StreamEntry {
  return {
    id,
    fields: { saleId: SALE_ID, userId, purchasedAt: String(PURCHASED_AT) },
  };
}

function setup({
  fresh = [],
  stored = 0,
}: {
  fresh?: StreamEntry[];
  stored?: number;
} = {}) {
  const calls: string[] = [];
  const step = <T>(name: string, value: T) =>
    vi.fn<(...args: unknown[]) => Promise<T>>(async () => {
      calls.push(name);
      return value;
    });

  const stream = {
    readBatch: step("readBatch", fresh),
    deadLetter: step("deadLetter", undefined),
    ack: step("ack", undefined),
  };
  const purchases = {
    insertMany: step("insertMany", 0),
    countBySaleId: step("countBySaleId", stored),
  };
  const sales = {
    setRemainingStockFromPurchaseCount: step("setStock", undefined),
  };
  const onDeadLetter = vi.fn();
  const service = new PurchaseSyncService(
    stream,
    purchases,
    sales,
    CONSUMER,
    onDeadLetter,
  );
  return { service, stream, purchases, sales, calls, onDeadLetter };
}

describe("PurchaseSyncService.syncBatch", () => {
  test("with nothing to read it returns 0 and writes nothing", async () => {
    const { service, purchases, sales, stream } = setup();

    expect(await service.syncBatch(SALE_ID)).toBe(0);

    expect(purchases.insertMany).not.toHaveBeenCalled();
    expect(sales.setRemainingStockFromPurchaseCount).not.toHaveBeenCalled();
    expect(stream.ack).not.toHaveBeenCalled();
  });

  test("stores the batch, sets the stock, then acks, in that order", async () => {
    const { service, calls } = setup({
      fresh: [entryOf("1-0"), entryOf("2-0", OTHER_USER_ID)],
    });

    await service.syncBatch(SALE_ID);

    expect(calls).toStrictEqual([
      "readBatch",
      "insertMany",
      "countBySaleId",
      "setStock",
      "ack",
    ]);
  });

  test("inserts parsed purchases, acks every entry, and returns how many it handled", async () => {
    const { service, purchases, stream } = setup({
      fresh: [entryOf("1-0"), entryOf("2-0", OTHER_USER_ID)],
    });

    const handled = await service.syncBatch(SALE_ID);

    expect(purchases.insertMany).toHaveBeenCalledWith([
      { saleId: SALE_ID, userId: USER_ID, purchasedAt: PURCHASED_AT },
      { saleId: SALE_ID, userId: OTHER_USER_ID, purchasedAt: PURCHASED_AT },
    ]);
    expect(stream.ack).toHaveBeenCalledWith(SALE_ID, ["1-0", "2-0"]);
    expect(handled).toBe(2);
  });

  test("reads as the configured consumer", async () => {
    const { service, stream } = setup();

    await service.syncBatch(SALE_ID);

    expect(stream.readBatch).toHaveBeenCalledExactlyOnceWith(SALE_ID, CONSUMER);
  });

  test("sets the stock from the stored purchase count, not from the batch size", async () => {
    const { service, sales } = setup({ fresh: [entryOf("1-0")], stored: 57 });

    await service.syncBatch(SALE_ID);

    expect(sales.setRemainingStockFromPurchaseCount).toHaveBeenCalledWith(
      SALE_ID,
      57,
    );
  });

  describe("on failure the batch stays unacknowledged, to be redelivered", () => {
    test("when inserting into Mongo fails", async () => {
      const { service, purchases, sales, stream } = setup({
        fresh: [entryOf("1-0")],
      });
      const error = new Error("mongo down");
      purchases.insertMany.mockRejectedValue(error);

      await expect(service.syncBatch(SALE_ID)).rejects.toBe(error);

      expect(sales.setRemainingStockFromPurchaseCount).not.toHaveBeenCalled();
      expect(stream.ack).not.toHaveBeenCalled();
    });

    test("when updating the stock fails", async () => {
      const { service, sales, stream } = setup({ fresh: [entryOf("1-0")] });
      const error = new Error("update failed");
      sales.setRemainingStockFromPurchaseCount.mockRejectedValue(error);

      await expect(service.syncBatch(SALE_ID)).rejects.toBe(error);

      expect(stream.ack).not.toHaveBeenCalled();
    });

    test("when reading the stream fails", async () => {
      const { service, stream, purchases } = setup();
      const error = new Error("redis down");
      stream.readBatch.mockRejectedValue(error);

      await expect(service.syncBatch(SALE_ID)).rejects.toBe(error);

      expect(purchases.insertMany).not.toHaveBeenCalled();
    });
  });

  describe("a malformed entry is parked, not retried forever", () => {
    const malformed = { id: "2-0", fields: { userId: "no good!" } };

    test("valid entries in the same batch are still stored", async () => {
      const { service, purchases } = setup({
        fresh: [entryOf("1-0"), malformed, entryOf("3-0", OTHER_USER_ID)],
      });

      await service.syncBatch(SALE_ID);

      expect(purchases.insertMany).toHaveBeenCalledWith([
        expect.objectContaining({ userId: USER_ID }),
        expect.objectContaining({ userId: OTHER_USER_ID }),
      ]);
    });

    test("the bad entry goes to the dead-letter stream with the reason, then everything is acked", async () => {
      const { service, stream, calls } = setup({
        fresh: [entryOf("1-0"), malformed],
      });

      const handled = await service.syncBatch(SALE_ID);

      expect(stream.deadLetter).toHaveBeenCalledExactlyOnceWith(SALE_ID, [
        { entry: malformed, reason: expect.stringContaining("userId") },
      ]);
      expect(stream.ack).toHaveBeenCalledWith(SALE_ID, ["1-0", "2-0"]);
      expect(calls.slice(-3)).toStrictEqual(["setStock", "deadLetter", "ack"]);
      expect(handled).toBe(2);
    });

    test("a batch of only malformed entries makes no Mongo writes, but is still parked and acked", async () => {
      const { service, purchases, sales, stream } = setup({
        fresh: [malformed],
      });

      await service.syncBatch(SALE_ID);

      expect(purchases.insertMany).not.toHaveBeenCalled();
      expect(purchases.countBySaleId).not.toHaveBeenCalled();
      expect(sales.setRemainingStockFromPurchaseCount).not.toHaveBeenCalled();
      expect(stream.deadLetter).toHaveBeenCalledOnce();
      expect(stream.ack).toHaveBeenCalledWith(SALE_ID, ["2-0"]);
    });

    test("reports it through onDeadLetter", async () => {
      const { service, onDeadLetter } = setup({ fresh: [malformed] });

      await service.syncBatch(SALE_ID);

      expect(onDeadLetter).toHaveBeenCalledExactlyOnceWith(
        SALE_ID,
        malformed,
        expect.stringContaining("userId"),
      );
    });

    test("is not acked if parking it fails, so nothing is lost", async () => {
      const { service, stream } = setup({ fresh: [malformed] });
      stream.deadLetter.mockRejectedValue(new Error("redis down"));

      await expect(service.syncBatch(SALE_ID)).rejects.toThrow("redis down");

      expect(stream.ack).not.toHaveBeenCalled();
    });

    test("valid entries never touch the dead-letter stream", async () => {
      const { service, stream, onDeadLetter } = setup({
        fresh: [entryOf("1-0")],
      });

      await service.syncBatch(SALE_ID);

      expect(stream.deadLetter).not.toHaveBeenCalled();
      expect(onDeadLetter).not.toHaveBeenCalled();
    });
  });
});
