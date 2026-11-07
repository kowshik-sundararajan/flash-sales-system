import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getUserId, generateAndSetUserId } from "./userId";

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("setUserId generates a UUID and persists it", () => {
  const id = generateAndSetUserId();

  expect(id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
  expect(store.get("userId")).toBe(id);
});

test("setUserId overwrites an existing id", () => {
  store.set("userId", "old");

  const id = generateAndSetUserId();

  expect(id).not.toBe("old");
  expect(store.get("userId")).toBe(id);
});

test("getUserId returns the stored id", () => {
  store.set("userId", "existing-id");

  expect(getUserId()).toBe("existing-id");
});

test("getUserId creates and stores an id when none exists", () => {
  const id = getUserId();

  expect(id).toBeTruthy();
  expect(store.get("userId")).toBe(id);
});

test("getUserId is stable across calls", () => {
  expect(getUserId()).toBe(getUserId());
});

test("getUserId replaces an empty stored id", () => {
  store.set("userId", "");

  const id = getUserId();

  expect(id).not.toBe("");
  expect(store.get("userId")).toBe(id);
});
