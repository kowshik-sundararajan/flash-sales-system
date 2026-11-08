import { describe, expect, test } from "vitest";
import { createLogger } from "../src/logger.js";

describe("createLogger", () => {
  test("names the logger, so its lines can be told apart", () => {
    expect(createLogger("worker").bindings()).toStrictEqual({ name: "worker" });
  });

  test("defaults to the info level", () => {
    expect(createLogger("worker").level).toBe("info");
  });

  test("uses the level it is given", () => {
    expect(createLogger("worker", "debug").level).toBe("debug");
  });

  test("rejects an unknown level at startup instead of logging nothing", () => {
    expect(() => createLogger("worker", "loud")).toThrow();
  });

  test("child loggers carry their fields on every line", () => {
    const child = createLogger("worker").child({
      consumer: "abc",
      saleId: "s1",
    });

    expect(child.bindings()).toStrictEqual({
      name: "worker",
      consumer: "abc",
      saleId: "s1",
    });
  });
});
