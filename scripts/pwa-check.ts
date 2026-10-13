// Checks the installable phone app on the local production build (phases/12-phone-app step 2): starts the standalone
// server as scripts/lighthouse.ts does, then in Playwright's Chromium checks that
//   - /manifest.webmanifest has the expected fields and Chromium reports no installability errors for /app,
//   - public/sw.js registers on /app with scope /app and controls /app, but not /assistant,
//   - /api requests from a controlled page never come from the service worker, and Cache Storage holds only the
//     offline page,
//   - with the server gone, /app shows the offline page.
// Usage: `npm run build`, then `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/pwa-check.ts`.
// Runs on Node's own TypeScript support, not tsx: tsx adds a `__name` helper to functions sent into the page.

import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const ROOT = process.cwd();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const failures: string[] = [];
function check(ok: boolean, what: string) {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
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

async function main() {
  if (!existsSync(join(ROOT, ".next/standalone/server.js"))) throw new Error("No production build: run `npm run build` first.");
  cpSync(join(ROOT, "public"), join(ROOT, ".next/standalone/public"), { recursive: true });
  cpSync(join(ROOT, ".next/static"), join(ROOT, ".next/standalone/.next/static"), { recursive: true });

  const port = await freePort();
  // localhost, not 127.0.0.1: a service worker needs a secure context, and Chromium treats localhost as one.
  const base = `http://localhost:${port}`;
  const server = spawn(process.execPath, [join(ROOT, ".next/standalone/server.js")], {
    cwd: join(ROOT, ".next/standalone"),
    env: { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "localhost", STORE: "memory", ALLOW_MEMORY_STORE: "1" },
    stdio: "ignore",
  });
  const browser = await chromium.launch();
  try {
    for (let deadline = Date.now() + 60_000; ; await sleep(300)) {
      if (server.exitCode !== null) throw new Error(`Server exited (${server.exitCode})`);
      if ((await fetch(`${base}/api/health`).then((r) => r.status, () => 0)) === 200) break;
      if (Date.now() > deadline) throw new Error("Server did not start within 60 s");
    }

    const manifest = (await (await fetch(`${base}/manifest.webmanifest`)).json()) as Record<string, unknown>;
    check(manifest.start_url === "/app" && manifest.display === "standalone" && manifest.scope === "/", "manifest: start_url /app, scope /, standalone");
    const icons = (manifest.icons as { src: string; sizes: string; purpose?: string }[]) ?? [];
    check(["192x192", "512x512"].every((s) => icons.some((i) => i.sizes === s)) && icons.some((i) => i.purpose === "maskable"), "manifest: 192, 512 and maskable icons");
    for (const i of icons) {
      check((await fetch(base + i.src)).headers.get("content-type") === "image/png", `icon ${i.src} is served as PNG`);
    }

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(`${base}/app`);
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    check(scope === `${base}/app`, `service worker registered with scope /app (${scope})`);

    const cdp = await context.newCDPSession(page);
    const { installabilityErrors } = (await cdp.send("Page.getInstallabilityErrors")) as { installabilityErrors: { errorId: string }[] };
    check(installabilityErrors.length === 0, `Chromium installability errors: ${JSON.stringify(installabilityErrors.map((e) => e.errorId))}`);
    const { errors } = (await cdp.send("Page.getAppManifest")) as { errors: { message: string }[] };
    check(errors.length === 0, `Chromium manifest errors: ${JSON.stringify(errors.map((e) => e.message))}`);

    // Once the worker is active, a reload is controlled by it; /api from that page must still go to the network.
    await page.reload();
    check(await page.evaluate(() => navigator.serviceWorker.controller !== null), "/app is controlled by the service worker");
    const apiResponse = page.waitForResponse((r) => r.url().endsWith("/api/health"));
    await page.evaluate(() => fetch("/api/health"));
    check(!(await apiResponse).fromServiceWorker(), "/api/health from a controlled page is not served by the service worker");
    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const key of await caches.keys()) for (const req of await (await caches.open(key)).keys()) urls.push(new URL(req.url).pathname);
      return urls;
    });
    check(JSON.stringify(cached) === JSON.stringify(["/offline.html"]), `Cache Storage holds only the offline page (${JSON.stringify(cached)})`);

    const phone = await context.newPage();
    await phone.goto(`${base}/assistant`);
    check(await phone.evaluate(() => navigator.serviceWorker.controller === null), "/assistant is not controlled by the service worker");
    await phone.close();

    // No network to the server at all: /app falls back to the cached offline page.
    server.kill();
    await new Promise((r) => server.once("exit", r));
    await page.goto(`${base}/app`).catch(() => undefined);
    check(await page.getByText("You're offline.").isVisible(), "/app shows the offline page without a network");
    await context.close();
  } finally {
    await browser.close();
    if (server.exitCode === null) server.kill();
  }
  if (failures.length) {
    console.error(`${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("all PWA checks passed");
}

await main();
