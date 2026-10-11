import { defineConfig } from "vitest/config";

// Without its own config vitest would pick up `vite.config.ts`, whose root is the floor's sources.
export default defineConfig({ test: { include: ["src/**/*.test.ts", "build/**/*.test.ts"] } });
