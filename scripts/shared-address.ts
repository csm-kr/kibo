// Shared-address check (docs/plan/judges/JUDGE_QA.md A3): judges behind one office address share KIBO's per-address
// limits. Opens 5 /demo pages on the deployed service at once from this machine (one address), presses [Start] on
// each, and keeps them open for 3 minutes without sending any AI message. Records whether every page reached
// "Connected", whether any page showed "Busy right now. Reconnecting…", and every HTTP 429 the pages received.
// Writes evidence/shared-address.json: counts and timings only, no tokens or session ids.
// Run with `npm run check:shared-address` (`-- --url=https://…` for another deployment, `-- --pages=N`).

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const DEFAULT_URL = "https://kibo-407514467119.asia-northeast3.run.app";
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const BASE = (arg("url") ?? DEFAULT_URL).replace(/\/$/, "");
const PAGES = Number(arg("pages") ?? 5);
const HOLD_MS = 3 * 60_000;
const SAMPLE_MS = 15_000;

interface PageRecord {
  page: number;
  connectedMs: number | null;
  busySeen: boolean;
  connectedAtEveryCheck: boolean;
  checks: number;
  status429: { path: string; atMs: number }[];
  otherErrors: { path: string; status: number; atMs: number }[];
}

async function main() {
  const browser = await chromium.launch();
  const t0 = performance.now();
  const at = () => Math.round(performance.now() - t0);
  const records: PageRecord[] = [];
  const pages = await Promise.all(
    Array.from({ length: PAGES }, async (_, i) => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const rec: PageRecord = { page: i + 1, connectedMs: null, busySeen: false, connectedAtEveryCheck: true, checks: 0, status429: [], otherErrors: [] };
      records.push(rec);
      page.on("response", (r) => {
        const path = new URL(r.url()).pathname.replace(/\/api\/session\/[^/]+\/events/, "/api/session/{id}/events");
        if (r.status() === 429) rec.status429.push({ path, atMs: at() });
        else if (r.status() >= 400 && path.startsWith("/api/")) rec.otherErrors.push({ path, status: r.status(), atMs: at() });
      });
      return { page, rec };
    }),
  );

  // All five at once, like five judges pressing Start together.
  await Promise.all(
    pages.map(async ({ page, rec }) => {
      const start = performance.now();
      await page.goto(`${BASE}/demo`);
      await page.getByRole("button", { name: "Start", exact: true }).click();
      try {
        await page.locator("[data-phone-screen]").getByText("Connected", { exact: true }).first().waitFor({ timeout: 60_000 });
        rec.connectedMs = Math.round(performance.now() - start);
      } catch {
        rec.connectedMs = null;
      }
    }),
  );
  console.log("connected:", records.map((r) => r.connectedMs));

  const end = performance.now() + HOLD_MS;
  while (performance.now() < end) {
    await new Promise((r) => setTimeout(r, SAMPLE_MS));
    await Promise.all(
      pages.map(async ({ page, rec }) => {
        rec.checks++;
        const busy = await page.getByText("Busy right now. Reconnecting…").count();
        const connected = await page.locator("[data-phone-screen]").getByText("Connected", { exact: true }).count();
        if (busy) rec.busySeen = true;
        if (!connected) rec.connectedAtEveryCheck = false;
      }),
    );
  }
  await browser.close();

  records.sort((a, b) => a.page - b.page);
  const health = (await (await fetch(`${BASE}/api/health`)).json()) as { revision?: string };
  const out = {
    about:
      `${PAGES} /demo pages opened at once on the deployed service from one laptop (one address, headless Chromium, ` +
      "one browser context each), [Start] pressed on all, then held open 3 minutes with no AI message; checked every " +
      "15 s for the phone's \"Connected\" and the \"Busy right now. Reconnecting…\" line. Each /demo page holds two " +
      "session streams and pings every 30 s. One run (R-001).",
    url: BASE,
    revision: health.revision ?? null,
    at: new Date().toISOString(),
    holdMs: HOLD_MS,
    pages: records,
    summary: {
      pages: PAGES,
      reachedConnected: records.filter((r) => r.connectedMs !== null).length,
      connectedThroughout: records.filter((r) => r.connectedMs !== null && r.connectedAtEveryCheck).length,
      busySeen: records.filter((r) => r.busySeen).length,
      responses429: records.reduce((n, r) => n + r.status429.length, 0),
      otherApiErrors: records.reduce((n, r) => n + r.otherErrors.length, 0),
    },
  };
  writeFileSync(join(process.cwd(), "evidence/shared-address.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify(out.summary));
}

main().catch((e) => {
  console.error("shared-address check failed:", e instanceof Error ? e.message : "error");
  process.exit(1);
});
