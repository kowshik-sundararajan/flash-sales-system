import type { RedisClient } from "../bootstrap.js";
import type { SaleId } from "../schemas/sale.schema.js";
import { saleKeys } from "./purchases.repository.js";

export const PURCHASE_SYNC_GROUP = "purchase-sync";
const BATCH_SIZE = 500;
const DEFAULT_CLAIM_IDLE_MS = 10_000;

export interface StreamEntry {
  id: string;
  fields: Record<string, string>;
}

export interface RejectedEntry {
  entry: StreamEntry;
  reason: string;
}

export interface PurchaseStream {
  ensureConsumerGroup(saleId: SaleId): Promise<void>;
  readBatch(saleId: SaleId, consumer: string): Promise<StreamEntry[]>;
  deadLetter(saleId: SaleId, rejected: RejectedEntry[]): Promise<void>;
  ack(saleId: SaleId, ids: string[]): Promise<void>;
}

async function execOrThrow(
  transaction: Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await transaction;
  } catch (cause) {
    throw new Error(message, { cause });
  }
}

type ReadReply =
  | {
      name: string;
      messages: { id: string; message: Record<string, string> }[];
    }[]
  | null;

export class RedisPurchaseStream implements PurchaseStream {
  constructor(
    private readonly redis: RedisClient,
    private readonly blockMs = 2_000,
    private readonly claimIdleMs = DEFAULT_CLAIM_IDLE_MS,
  ) {}

  async ensureConsumerGroup(saleId: SaleId): Promise<void> {
    try {
      await this.redis.xGroupCreate(
        saleKeys.stream(saleId),
        PURCHASE_SYNC_GROUP,
        "0",
        { MKSTREAM: true },
      );
    } catch (error) {
      const alreadyExists =
        error instanceof Error && error.message.includes("BUSYGROUP");
      if (!alreadyExists) throw error;
    }
  }

  async readBatch(saleId: SaleId, consumer: string): Promise<StreamEntry[]> {
    const reply = (await this.redis.xReadGroup(
      PURCHASE_SYNC_GROUP,
      consumer,
      { key: saleKeys.stream(saleId), id: ">" },
      {
        COUNT: BATCH_SIZE,
        BLOCK: this.blockMs,
        CLAIM: this.claimIdleMs, // read entries abandoned by dead workers after idle ms
      },
    )) as ReadReply;

    const messages = reply?.[0]?.messages ?? [];
    return messages.map(({ id, message }) => ({ id, fields: message }));
  }

  async deadLetter(saleId: SaleId, rejected: RejectedEntry[]): Promise<void> {
    if (rejected.length === 0) return;

    const query = this.redis.multi();
    for (const { entry, reason } of rejected) {
      query.xAdd(saleKeys.deadLetter(saleId), "*", {
        entryId: entry.id,
        reason,
        fields: JSON.stringify(entry.fields),
      });
    }
    await execOrThrow(query.exec(), "failed to dead-letter stream entries");
  }

  async ack(saleId: SaleId, ids: string[]): Promise<void> {
    const key = saleKeys.stream(saleId);
    await execOrThrow(
      this.redis
        .multi()
        .xAck(key, PURCHASE_SYNC_GROUP, ids)
        .xDel(key, ids)
        .exec(),
      "failed to ack purchase stream entries",
    );
  }
}
