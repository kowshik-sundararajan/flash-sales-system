import { expect, test } from "vitest";
import { formatDuration } from "./helpers";

test("formatDuration formats hh:mm:ss, rounding partial seconds up", () => {
  expect(formatDuration(3_661_000)).toBe("01:01:01");
  expect(formatDuration(1_001)).toBe("00:00:02");
  expect(formatDuration(0)).toBe("00:00:00");
});

test("formatDuration clamps negatives to zero", () => {
  expect(formatDuration(-5_000)).toBe("00:00:00");
});
