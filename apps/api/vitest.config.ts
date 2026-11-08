import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/**/*.test.ts"],
          exclude: ["test/integration/**", "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["test/integration/**/*.test.ts"],
          globalSetup: ["test/integration/setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
