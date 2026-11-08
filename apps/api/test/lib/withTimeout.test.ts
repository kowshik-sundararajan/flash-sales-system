import { afterEach, describe, expect, test, vi } from "vitest";
import { CommandTimeoutError } from "../../src/errors/errors.js";
import { withTimeout } from "../../src/lib/withTimeout.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout", () => {
  test("returns the result when the command is quick", async () => {
    await expect(withTimeout(Promise.resolve("done"), 100)).resolves.toBe(
      "done",
    );
  });

  test("passes the command's own error through", async () => {
    const error = new Error("boom");

    await expect(withTimeout(Promise.reject(error), 100)).rejects.toBe(error);
  });

  test("gives up when the command takes too long", async () => {
    vi.useFakeTimers();
    const slow = new Promise<string>((resolve) =>
      setTimeout(() => resolve("late"), 500),
    );

    const result = withTimeout(slow, 100);
    const assertion =
      expect(result).rejects.toBeInstanceOf(CommandTimeoutError);
    await vi.advanceTimersByTimeAsync(100);

    await assertion;
  });

  test("leaves no timer running once the command has finished", async () => {
    vi.useFakeTimers();

    await withTimeout(Promise.resolve("done"), 100);

    expect(vi.getTimerCount()).toBe(0);
  });
});
