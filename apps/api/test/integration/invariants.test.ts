import { describe, expect, test } from "vitest";

/** What Mongo and Redis hold for one sale. */
export interface Snapshot {
  initialStock: number;
  remainingInMongo: number;
  purchasesInMongo: number;
  distinctBuyers: number;
  stockInRedis: number;
  buyerKeysInRedis: number;
  streamLength: number;
  pendingEntries: number;
  deadLetters: number;
}

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

// 100 items, all sold, everything synced.
const HEALTHY: Snapshot = {
  initialStock: 100,
  remainingInMongo: 0,
  purchasesInMongo: 100,
  distinctBuyers: 100,
  stockInRedis: 0,
  buyerKeysInRedis: 100,
  streamLength: 0,
  pendingEntries: 0,
  deadLetters: 0,
};

export function evaluateInvariants(
  s: Snapshot,
  expectedPurchases: number = s.initialStock,
): Check[] {
  const left = s.initialStock - s.purchasesInMongo;

  return [
    {
      name: "sold exactly the expected number of items",
      ok: s.purchasesInMongo === expectedPurchases,
      detail: `${s.purchasesInMongo} purchases in Mongo, expected ${expectedPurchases}`,
    },
    {
      name: "never sold more than the stock",
      ok: s.purchasesInMongo <= s.initialStock,
      detail: `${s.purchasesInMongo} purchases, stock was ${s.initialStock}`,
    },
    {
      name: "no user bought twice",
      ok: s.distinctBuyers === s.purchasesInMongo,
      detail: `${s.distinctBuyers} distinct buyers for ${s.purchasesInMongo} purchases`,
    },
    {
      name: "Mongo stock matches the purchases",
      ok: s.remainingInMongo === left,
      detail: `remaining ${s.remainingInMongo}, expected ${left}`,
    },
    {
      name: "Redis stock matches and is not negative",
      ok: s.stockInRedis === left && s.stockInRedis >= 0,
      detail: `Redis stock ${s.stockInRedis}, expected ${left}`,
    },
    {
      name: "Redis buyer records match Mongo",
      ok: s.buyerKeysInRedis === s.purchasesInMongo,
      detail: `${s.buyerKeysInRedis} buyer keys, ${s.purchasesInMongo} purchases`,
    },
    {
      name: "the stream is fully synced",
      ok: s.streamLength === 0 && s.pendingEntries === 0,
      detail: `${s.streamLength} entries left, ${s.pendingEntries} pending`,
    },
    {
      name: "nothing was dead-lettered",
      ok: s.deadLetters === 0,
      detail: `${s.deadLetters} dead-lettered entries`,
    },
  ];
}

const failing = (snapshot: Snapshot, expected?: number) =>
  evaluateInvariants(snapshot, expected)
    .filter((check) => !check.ok)
    .map((check) => check.name);

describe("evaluateInvariants", () => {
  test("a clean sell-out passes every check", () => {
    expect(failing(HEALTHY)).toStrictEqual([]);
  });

  test("overselling is caught", () => {
    const oversold = {
      ...HEALTHY,
      purchasesInMongo: 101,
      distinctBuyers: 101,
      buyerKeysInRedis: 101,
      remainingInMongo: -1,
      stockInRedis: -1,
    };

    expect(failing(oversold)).toContain("never sold more than the stock");
    expect(failing(oversold)).toContain(
      "Redis stock matches and is not negative",
    );
  });

  test("underselling is caught when everything should have sold", () => {
    const undersold = {
      ...HEALTHY,
      purchasesInMongo: 99,
      distinctBuyers: 99,
      buyerKeysInRedis: 99,
      remainingInMongo: 1,
      stockInRedis: 1,
    };

    expect(failing(undersold)).toStrictEqual([
      "sold exactly the expected number of items",
    ]);
  });

  test("a lower expectation fits a sale that was not sold out", () => {
    const partial = {
      ...HEALTHY,
      purchasesInMongo: 40,
      distinctBuyers: 40,
      buyerKeysInRedis: 40,
      remainingInMongo: 60,
      stockInRedis: 60,
    };

    expect(failing(partial, 40)).toStrictEqual([]);
  });

  test.each<[string, Partial<Snapshot>, string]>([
    ["a user bought twice", { distinctBuyers: 99 }, "no user bought twice"],
    [
      "Mongo stock is out of step",
      { remainingInMongo: 3 },
      "Mongo stock matches the purchases",
    ],
    [
      "Redis stock is out of step",
      { stockInRedis: 2 },
      "Redis stock matches and is not negative",
    ],
    [
      "Redis has a buyer Mongo does not",
      { buyerKeysInRedis: 101 },
      "Redis buyer records match Mongo",
    ],
    [
      "entries are left in the stream",
      { streamLength: 4 },
      "the stream is fully synced",
    ],
    [
      "entries are still pending",
      { pendingEntries: 2 },
      "the stream is fully synced",
    ],
    [
      "an entry was dead-lettered",
      { deadLetters: 1 },
      "nothing was dead-lettered",
    ],
  ])("%s", (_name, change, check) => {
    expect(failing({ ...HEALTHY, ...change })).toContain(check);
  });

  test("every check explains itself", () => {
    for (const check of evaluateInvariants(HEALTHY)) {
      expect(check.detail).not.toBe("");
    }
  });
});
