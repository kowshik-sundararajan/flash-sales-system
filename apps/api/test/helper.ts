import type { Db } from "mongodb";
import { vi } from "vitest";

export function fakeDb(findOne: ReturnType<typeof vi.fn>) {
  const collection = vi.fn().mockReturnValue({ findOne });
  return { db: { collection } as unknown as Db, collection };
}
