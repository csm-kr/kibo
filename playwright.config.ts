import { defineConfig, devices } from "@playwright/test";

const appServer = {
  command: "npm run dev -- --port 3100",
  url: "http://localhost:3100/api/health",
  env: { STORE: "memory", KIBO_DEV_CACHE: "off" },
  reuseExistingServer: false,
  timeout: 120_000,
};

// `npm run test:e2e:live` only: a second app on 3110 whose voice goes through the Vertex relay (3111), both in one
// process (scripts/e2e-relay-stack.ts), for the relay mode of e2e/voice.live.spec.ts. Its own build folder, since
// Next.js allows one dev server per folder, and outside .next, which `next build` empties.
const relayStack = {
  command: "npx tsx scripts/e2e-relay-stack.ts",
  url: "http://localhost:3110/api/health",
  env: { STORE: "memory", KIBO_DEV_CACHE: "off", KIBO_DIST_DIR: ".next-e2e-relay", PORT: "3110", RELAY_PORT: "3111" },
  reuseExistingServer: false,
  timeout: 180_000,
};

// Browser E2E against the dev server with the in-memory store: no Firestore, no network (docs/TESTING.md).
export default defineConfig({
  testDir: "e2e",
  // The UI QA specs have their own config (npm run qa:ui).
  testIgnore: "qa/**",
  // One worker: every test shares the dev server's per-IP limit (60 API requests a minute).
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_LIVE === "1" ? [appServer, relayStack] : appServer,
});
