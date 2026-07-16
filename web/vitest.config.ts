import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // tsconfig uses jsx:"preserve" (Next requirement) — tell vitest's oxc transform to compile JSX.
  oxc: { jsx: { runtime: "automatic" } },
  // Every directory that can hold a test must be listed — a missing glob doesn't fail, it just
  // silently runs nothing, which looks identical to passing.
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "features/**/*.test.ts"],
  },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
