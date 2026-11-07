import { describe, expect, test } from "vitest";
import { userIdSchema } from "../../src/schemas/userId.schema.js";

describe("userIdSchema", () => {
  test.each([
    { input: "kow", expected: "kow" },
    { input: "  johndoe30  ", expected: "johndoe30" },
    { input: "a".repeat(32), expected: "a".repeat(32) },
  ])("accepts $input", ({ input, expected }) => {
    expect(userIdSchema.parse(input)).toBe(expected);
  });

  test.each([
    { name: "2 characters", input: "ko" },
    { name: "33 characters", input: "a".repeat(33) },
    { name: "spaces inside", input: "kow 42" },
    { name: "a hyphen", input: "kow-42" },
    { name: "an underscore", input: "kow_42" },
    { name: "a dot", input: "kow.42" },
    { name: "an email", input: "kow@example.com" },
    { name: "braces", input: "{kow}" },
    { name: "a colon", input: "kow:42" },
    { name: "a wildcard", input: "kow*" },
    { name: "non-ASCII letters", input: "kowé42" },
    { name: "a UUID", input: "6b1f6f0e-3c1a-4a43-8f55-0d6c1b2a9e10" },
    { name: "an empty string", input: "" },
    { name: "a blank string", input: "   " },
  ])("rejects $name", ({ input }) => {
    expect(userIdSchema.safeParse(input).success).toBe(false);
  });

  test.each([
    { name: "a number", input: 123 },
    { name: "null", input: null },
    { name: "undefined", input: undefined },
    { name: "an operator object", input: { $ne: null } },
  ])("rejects $name", ({ input }) => {
    expect(userIdSchema.safeParse(input).success).toBe(false);
  });
});
