import { describe, expect, test } from "vitest";
import { loadConfig } from "../src/config.js";

const base = { DB_URL: "mongodb://db/x", REDIS_URL: "redis://r" };

describe("loadConfig", () => {
  test("returns config with default host localhost and port 3000", () => {
    expect(loadConfig(base)).toEqual({
      host: "localhost",
      port: 3000,
      dbUrl: "mongodb://db/x",
      redisUrl: "redis://r",
    });
  });

  test("parses HOST from env", () => {
    expect(loadConfig({ ...base, HOST: "0.0.0.0" }).host).toBe("0.0.0.0");
  });

  test.each(["", "   "])("falls back to localhost on blank HOST %j", (host) => {
    expect(loadConfig({ ...base, HOST: host }).host).toBe("localhost");
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
