import { describe, expect, test } from "vitest";
import { loadConfig } from "../src/config.js";

const base = { DB_URL: "mongodb://db/x", REDIS_URL: "redis://r" };

describe("loadConfig", () => {
  test("returns config with default port 3000", () => {
    expect(loadConfig(base)).toEqual({
      port: 3000,
      dbUrl: "mongodb://db/x",
      redisUrl: "redis://r",
    });
  });

  test("parses PORT from env", () => {
    expect(loadConfig({ ...base, PORT: "8080" }).port).toBe(8080);
  });

  test("throws when DB_URL is missing", () => {
    expect(() => loadConfig({ REDIS_URL: "redis://r" })).toThrow(/DB_URL/);
  });

  test("throws when REDIS_URL is missing", () => {
    expect(() => loadConfig({ DB_URL: "mongodb://db/x" })).toThrow(/REDIS_URL/);
  });

  test.each(["abc", "0", "65536", "-1"])(
    "throws on invalid PORT %s",
    (port) => {
      expect(() => loadConfig({ ...base, PORT: port })).toThrow(/PORT/);
    },
  );
});
