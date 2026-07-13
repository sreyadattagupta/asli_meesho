import { defineConfig, devices } from "@playwright/test";

// 3-persona demo E2E (specs in ../e2e). Config lives in web/ so @playwright/test resolves from
// web/node_modules. Boots the Next dev server with the strictly-gated auth bypass so tests can act
// as seller/buyer/admin without a live Auth0 tenant (see lib/auth.ts, middleware.ts).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "line" : "list",
  timeout: 60_000, // dev-mode on-demand route compilation can be slow on first hit
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      AUTH_TEST_BYPASS: "1",
      DATA_BACKEND: "memory",
      VLM_PROVIDER: "mock",
      TRIGGER_SOURCE: "mock",
      NEXT_PUBLIC_ENABLE_VOICE: "false",
    },
  },
});
