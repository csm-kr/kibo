// Lighthouse scores (phases/11-hardening step 4) on the local production build, never the deployed URL.
// Starts the standalone server Cloud Run runs (`node .next/standalone/server.js`, with `public/` and `.next/static`
// copied next to it as the Dockerfile does) on a free 127.0.0.1 port with STORE=memory and ALLOW_MEMORY_STORE=1, then
// runs Lighthouse with the Chromium Playwright installed on each page: `/` desktop and mobile, `/demo` desktop,
// `/assistant` mobile (opened from a fresh session's QR link, so the page claims it as a phone would), `/kiosk` desktop.
// Each page runs 3 times; the evidence keeps the median score per category and the audits that failed in the median
// run (ids and titles only). HTML reports of the median run go to phases/11-hardening/qa/ (git-ignored).
// Usage: `npm run build`, then `npm run lighthouse -- --label before` (a run with the same label is replaced).
// Runs on Node's own TypeScript support, not tsx: tsx adds a `__name` helper to functions, and Lighthouse sends some
// of its functions into the page, where that helper does not exist.

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { cpus, platform } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";

const ROOT = process.cwd();
const RUNS = 3;
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;
const EVIDENCE = join(ROOT, "evidence/lighthouse.json");
const REPORTS = join(ROOT, "phases/11-hardening/qa");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const labelArg = process.argv.indexOf("--label");
const LABEL = labelArg > 0 ? process.argv[labelArg + 1] : undefined;
if (!LABEL || !/^[a-z0-9-]+$/.test(LABEL)) throw new Error("Pass --label <name> (lowercase letters, digits, dashes).");

type FormFactor = "desktop" | "mobile";
interface Page {
  name: string;
  path: string | ((base: string) => Promise<string>);
  formFactor: FormFactor;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

/** A fresh MALO session's QR link; the claim token is in the fragment, so the page claims it on load. */
async function claimLink(base: string): Promise<string> {
  const res = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.90" },
    body: JSON.stringify({ kioskId: "malo" }),
  });
  const { claimUrl } = (await res.json()) as { claimUrl: string };
  return claimUrl;
}

const PAGES: Page[] = [
  { name: "home", path: "/", formFactor: "desktop" },
  { name: "home", path: "/", formFactor: "mobile" },
  { name: "demo", path: "/demo", formFactor: "desktop" },
  { name: "assistant", path: claimLink, formFactor: "mobile" },
  { name: "kiosk", path: "/kiosk", formFactor: "desktop" },
];

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function main() {
  if (!existsSync(join(ROOT, ".next/standalone/server.js"))) throw new Error("No production build: run `npm run build` first.");
  // The standalone server does not include static assets (Dockerfile does the same copy).
  cpSync(join(ROOT, "public"), join(ROOT, ".next/standalone/public"), { recursive: true });
  cpSync(join(ROOT, ".next/static"), join(ROOT, ".next/standalone/.next/static"), { recursive: true });

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [join(ROOT, ".next/standalone/server.js")], {
    cwd: join(ROOT, ".next/standalone"),
    env: { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", STORE: "memory", ALLOW_MEMORY_STORE: "1" },
    stdio: "ignore",
  });
  const chrome = await chromeLauncher.launch({ chromePath: chromium.executablePath(), chromeFlags: ["--headless=new"] });
  mkdirSync(REPORTS, { recursive: true });

  try {
    for (let deadline = Date.now() + 60_000; ; await sleep(300)) {
      if (server.exitCode !== null) throw new Error(`Server exited (${server.exitCode})`);
      if ((await fetch(`${base}/api/health`).then((r) => r.status, () => 0)) === 200) break;
      if (Date.now() > deadline) throw new Error("Server did not start within 60 s");
    }

    const results = [];
    let n = 0;
    let lighthouseVersion = "";
    let browserVersion = "";
    for (const page of PAGES) {
      const runs: NonNullable<Awaited<ReturnType<typeof lighthouse>>>[] = [];
      for (let i = 0; i < RUNS; i++) {
        const url = typeof page.path === "string" ? base + page.path : await page.path(base);
        // Each load gets its own address, so the per-IP limits never carry over between loads.
        const flags = { port: chrome.port, output: ["html" as const], logLevel: "error" as const, onlyCategories: [...CATEGORIES], extraHeaders: { "X-Forwarded-For": `198.51.100.${100 + n++}` } };
        const result = await lighthouse(url, flags, page.formFactor === "desktop" ? desktopConfig : undefined);
        if (!result) throw new Error(`No Lighthouse result for ${page.name}`);
        runs.push(result);
      }
      const scoreOf = (r: (typeof runs)[number], c: string) => Math.round((r.lhr.categories[c]?.score ?? 0) * 100);
      const perf = runs.map((r) => scoreOf(r, "performance"));
      const mid = runs[perf.indexOf(median(perf))];
      const lhr = mid.lhr;
      lighthouseVersion = lhr.lighthouseVersion;
      browserVersion = /(?:HeadlessChrome|Chrome)\/[\d.]+/.exec(lhr.environment.hostUserAgent)?.[0] ?? "";
      const report = Array.isArray(mid.report) ? mid.report[0] : mid.report;
      writeFileSync(join(REPORTS, `lighthouse-${LABEL}-${page.name}-${page.formFactor}.html`), report);

      const failed: Record<string, string[]> = {};
      for (const c of CATEGORIES) {
        failed[c] = lhr.categories[c].auditRefs
          .filter((ref) => ref.weight > 0)
          .map((ref) => lhr.audits[ref.id])
          .filter((a) => a.score !== null && a.score < (c === "performance" ? 0.9 : 1))
          .map((a) => `${a.id}: ${a.title}${a.displayValue ? ` (${a.displayValue})` : ""}`);
      }
      const metric = (id: string) => lhr.audits[id]?.displayValue ?? null;
      const requests = (lhr.audits["network-requests"].details as unknown as { items: { resourceType?: string; transferSize?: number }[] }).items;
      const kb = (rs: typeof requests) => Math.round(rs.reduce((s, r) => s + (r.transferSize ?? 0), 0) / 1024);
      const fonts = requests.filter((r) => r.resourceType === "Font");
      const observed = (lhr.audits.metrics.details as unknown as { items: { observedLargestContentfulPaint?: number }[] }).items[0];
      results.push({
        page: page.name,
        path: typeof page.path === "string" ? page.path : "/assistant?s=<session>#t=<claim>",
        formFactor: page.formFactor,
        scores: Object.fromEntries(CATEGORIES.map((c) => [c, median(runs.map((r) => scoreOf(r, c)))])),
        performanceRuns: perf,
        medianRunMetrics: { fcp: metric("first-contentful-paint"), lcp: metric("largest-contentful-paint"), tbt: metric("total-blocking-time"), cls: metric("cumulative-layout-shift"), si: metric("speed-index") },
        // Unthrottled: what the laptop measured, not Lighthouse's simulated slow network.
        medianRunObservedLcpMs: Math.round(observed.observedLargestContentfulPaint ?? 0),
        medianRunTransfer: { totalKb: kb(requests), requests: requests.length, fontRequests: fonts.length, fontKb: kb(fonts) },
        medianRunFailedAudits: failed,
        runWarnings: lhr.runWarnings,
      });
      const s = results[results.length - 1].scores;
      console.log(`${page.name} ${page.formFactor}: perf ${s.performance} (${perf.join(", ")}), a11y ${s.accessibility}, bp ${s["best-practices"]}, seo ${s.seo}`);
    }

    const evidence = existsSync(EVIDENCE) ? JSON.parse(readFileSync(EVIDENCE, "utf8")) : { what: "", runs: [] };
    evidence.what =
      "Lighthouse on the local production build (standalone server.js as on Cloud Run, STORE=memory), not the deployed URL. Scores are the median of 3 loads per page; desktop uses Lighthouse's desktop config, mobile its default (simulated slow 4G, 4x CPU slowdown). Headless Chromium from Playwright on a laptop.";
    evidence.script = "scripts/lighthouse.ts (npm run lighthouse -- --label <name>)";
    const run = {
      label: LABEL,
      date: new Date().toISOString(),
      lighthouseVersion: lighthouseVersion,
      browser: browserVersion,
      machine: { platform: platform(), cpus: cpus().length, cpuModel: cpus()[0]?.model ?? null, node: process.version },
      pages: results,
    };
    evidence.runs = [...evidence.runs.filter((r: { label: string }) => r.label !== LABEL), run];
    writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2) + "\n");
    console.log("wrote evidence/lighthouse.json");
  } finally {
    chrome.kill();
    if (server.exitCode === null) server.kill("SIGTERM");
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
