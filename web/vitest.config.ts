import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // tsconfig uses jsx:"preserve" (Next requirement) — tell vitest's oxc transform to compile JSX.
  oxc: { jsx: { runtime: "automatic" } },
  test: { environment: "node", include: ["lib/**/*.test.ts", "app/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
