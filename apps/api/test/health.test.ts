import { describe, expect, test, vi } from "vitest";
import { buildApp } from "../src/app.js";

function appWith(checkDependencies: () => Promise<void>) {
  return buildApp({
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
    checkDependencies,
  });
}

describe("GET /api/health", () => {
  test("returns 200 and status ok when the dependencies answer", async () => {
    const checkDependencies = vi.fn().mockResolvedValue(undefined);
    const app = appWith(checkDependencies);

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(checkDependencies).toHaveBeenCalledOnce();

    await app.close();
  });

  test("returns 503 when a dependency does not answer, without saying why", async () => {
    const secret = "redis://user:pw@internal-host";
    const app = appWith(async () => {
      throw new Error(`cannot reach ${secret}`);
    });

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "unavailable" });
    expect(response.body).not.toContain(secret);

    await app.close();
  });
});
