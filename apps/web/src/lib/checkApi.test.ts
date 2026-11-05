import { expect, test } from "vitest";
import { checkApi } from "./checkApi";

test("is ok when the API reports status ok", async () => {
  const fetchHealth = async () => Response.json({ status: "ok" });

  expect(await checkApi(fetchHealth)).toBe("ok");
});

test("is unreachable on a non-2xx response", async () => {
  const fetchHealth = async () => new Response(null, { status: 500 });

  expect(await checkApi(fetchHealth)).toBe("unreachable");
});

test("is unreachable when the request fails", async () => {
  const fetchHealth = async () => {
    throw new TypeError("network error");
  };

  expect(await checkApi(fetchHealth)).toBe("unreachable");
});
