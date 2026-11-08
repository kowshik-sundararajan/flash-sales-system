import {
  ClientClosedError,
  ErrorReply,
  SocketClosedUnexpectedlyError,
} from "redis";
import {
  MongoNetworkError,
  MongoServerError,
  MongoServerSelectionError,
} from "mongodb";
import { describe, expect, test } from "vitest";
import {
  CommandTimeoutError,
  isDependencyOutage,
} from "../../src/errors/errors.js";

describe("isDependencyOutage", () => {
  test.each([
    ["a closed Redis client", new ClientClosedError()],
    ["a Redis socket that dropped", new SocketClosedUnexpectedlyError()],
    ["a command that timed out", new CommandTimeoutError("timed out")],
    [
      "Redis still loading its data",
      new ErrorReply("LOADING Redis is loading"),
    ],
    ["Redis busy running a script", new ErrorReply("BUSY Redis is busy")],
    ["a Mongo network error", new MongoNetworkError("connection reset")],
    [
      "Mongo with no server to talk to",
      new MongoServerSelectionError("no server", new Map() as never),
    ],
  ])("%s is an outage", (_name, error) => {
    expect(isDependencyOutage(error)).toBe(true);
  });

  test.each([
    ["a broken Lua script", new ErrorReply("ERR Error running script")],
    ["a wrong key type", new ErrorReply("WRONGTYPE Operation against a key")],
    ["a Mongo server error", new MongoServerError({ message: "bad query" })],
    ["a plain Error", new Error("boom")],
    ["a TypeError from our own code", new TypeError("x is undefined")],
    ["something that is not an error", "oops"],
  ])("%s is not, so it stays a bug", (_name, error) => {
    expect(isDependencyOutage(error)).toBe(false);
  });
});
