import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Automated UI QA (docs/UI_QA.md "Automating (Playwright)"), separate from `npm run test:e2e` so that stays fast.
// Screenshots and ui-qa.jsonl go to phases/<phase>/qa/ on a harness branch (feat-<phase>), else qa-output/.
// Harness sessions cannot prefix commands with env vars, so the branch is what they rely on; PHASE overrides.

function qaOutputDir(): string {
  let phase = process.env.PHASE;
  if (!phase) {
    try {
      const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
      if (branch.startsWith("feat-")) phase = branch.slice("feat-".length);
    } catch {
      // Not a git checkout: fall back to qa-output/.
    }
  }
  return phase && existsSync(`phases/${phase}`) ? `phases/${phase}/qa` : "qa-output";
}

export default defineConfig({
  testDir: "e2e/qa",
  globalSetup: "./e2e/qa/global-setup.ts",
  // One worker: every test shares the dev server's per-IP limit, and all of them append to one report.
  workers: 1,
  retries: 0,
  timeout: 180_000,
  metadata: { qaOut: qaOutputDir() },
  use: {
    baseURL: "http://localhost:3200",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // A fake microphone that is always allowed, so the voice states can be reached without a person.
        launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3200",
    url: "http://localhost:3200/api/health",
    // SHORT_APP_URL: the kiosk shows the short production host, as it will once deployed (12-phone-app:6). The E2E
    // config leaves it unset, so `npm run test:e2e` covers the "<host>/app" fallback.
    env: { STORE: "memory", KIBO_DEV_CACHE: "off", SHORT_APP_URL: "kibo-2026.web.app" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
