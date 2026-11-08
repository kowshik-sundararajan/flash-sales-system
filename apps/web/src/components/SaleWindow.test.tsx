// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { SaleWindow } from "./SaleWindow";
import type { SaleStatus } from "../types/sale";

const STARTS_AT = 1_000_000;
const ENDS_AT = 1_060_000;

afterEach(cleanup);

function renderText(status: SaleStatus, serverTime: number) {
  const { container } = render(
    <SaleWindow
      sale={{ status, startsAt: STARTS_AT, endsAt: ENDS_AT, serverTime }}
    />,
  );
  return container.textContent;
}

test("upcoming shows the countdown to the start", () => {
  expect(renderText("upcoming", STARTS_AT - 5_000)).toContain(
    "Starts in 00:05",
  );
});

test("active shows the countdown to the end", () => {
  expect(renderText("active", ENDS_AT - 30_000)).toContain("Ends in 00:30");
});

test("a countdown over an hour includes the hours", () => {
  expect(renderText("active", ENDS_AT - 3_725_000)).toContain(
    "Ends in 01:02:05",
  );
});

test("sold_out says the product has sold out and shows no countdown", () => {
  const text = renderText("sold_out", STARTS_AT + 1_000);

  expect(text).toContain("The product has sold out.");
  expect(text).not.toContain("Ends in");
});

test("ended shows the ended message", () => {
  expect(renderText("ended", ENDS_AT + 1_000)).toContain(
    "This sale has ended.",
  );
});
