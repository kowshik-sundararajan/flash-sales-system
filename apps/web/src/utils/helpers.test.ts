import { expect, test } from "vitest";
import { formatCountdown, formatDuration } from "./helpers";

test("formatDuration formats hh:mm:ss, rounding partial seconds up", () => {
  expect(formatDuration(3_661_000)).toBe("01:01:01");
  expect(formatDuration(1_001)).toBe("00:00:02");
  expect(formatDuration(0)).toBe("00:00:00");
});

test("formatDuration clamps negatives to zero", () => {
  expect(formatDuration(-5_000)).toBe("00:00:00");
});

test.each([
  [3_583_000, "59:43"],
  [5_000, "00:05"],
  [0, "00:00"],
  [-5_000, "00:00"],
  [3_600_000, "01:00:00"],
  [3_725_000, "01:02:05"],
])(
  "formatCountdown(%i) is %s, with hours only when there are some",
  (ms, expected) => {
    expect(formatCountdown(ms)).toBe(expected);
  },
);
