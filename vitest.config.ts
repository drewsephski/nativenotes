import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // Better Auth resource seeding and shared local Postgres are not safe
    // under parallel file workers.
    fileParallelism: false,
  },
});
