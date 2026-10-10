import { defineConfig } from "vitest/config";

// The end-to-end run needs the network and a real Codex: it has its own config and make target.
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
