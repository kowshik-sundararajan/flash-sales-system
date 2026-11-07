import { expect, test } from "vitest";
import { isValidUsername } from "./username";

test.each(["kow", "Kow42", "a".repeat(32)])(
  "%s is a valid username",
  (name) => {
    expect(isValidUsername(name)).toBe(true);
  },
);

test.each([
  "",
  "ko",
  "a".repeat(33),
  "kow 42",
  "kow-42",
  "kow_42",
  "kow.42",
  "kow@example.com",
  "kowé42",
])("%j is not a valid username", (name) => {
  expect(isValidUsername(name)).toBe(false);
});
