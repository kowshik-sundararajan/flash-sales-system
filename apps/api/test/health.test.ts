import { expect, test } from "vitest";
import { buildApp } from "../src/app.js";

test("GET /api/health returns 200 and status ok", async () => {
  const app = buildApp({
    salesService: {
      getStatus: async () => {
        throw new Error("unused");
      },
    },
    purchasesService: {
      purchase: async () => {
        throw new Error("unused");
      },
      getPurchase: async () => {
        throw new Error("unused");
      },
    },
  });

  const response = await app.inject({ method: "GET", url: "/api/health" });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ status: "ok" });

  await app.close();
});
