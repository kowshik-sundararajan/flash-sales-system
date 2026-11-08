import type { Db } from "mongodb";
import { vi } from "vitest";

export function fakeDb(methods: Record<string, unknown> = {}) {
  const collection = vi.fn().mockReturnValue(methods);
  return { db: { collection } as unknown as Db, collection };
}
