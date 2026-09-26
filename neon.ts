import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
    buckets: {
      uploads: { access: "private" },
    },
    functions: {
      api: { name: "api", source: "./hello.ts" },
    },
  },
});
