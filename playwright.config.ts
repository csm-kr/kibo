import { defineConfig, devices } from "@playwright/test";

// Browser E2E against the dev server with the in-memory store: no Firestore, no network (docs/TESTING.md).
export default defineConfig({
  testDir: "e2e",
  // One worker: every test shares the dev server's per-IP limit (60 API requests a minute).
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100/api/health",
    env: { STORE: "memory" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
