import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // Next's guard against importing server code in the browser; a no-op under test.
      "server-only": path.resolve(__dirname, "tests/server-only.ts"),
    },
  },
});
