import { defineConfig } from "vitest/config";

// One `codex exec` takes seconds, and the first run installs Codex from npm.
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 600_000,
    fileParallelism: false,
  },
});
