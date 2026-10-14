import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import type { Page } from "@playwright/test";

// The server the capture scripts (landing, deck, footage) record. By default the local production build, as Cloud Run
// runs it (`node .next/standalone/server.js`, like scripts/lighthouse.ts), so pictures show what ships: no dev
// compile reloads, production fonts and bundles. `SHOTS_DEV=1` starts `next dev` instead. Both use the in-memory store
// and the short app host production shows beside the pairing code (ARCHITECTURE "Environment variables").

const ROOT = process.cwd();
const SHORT_APP_URL = process.env.SHORT_APP_URL ?? "kibo-2026.web.app";

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, () => {
      const addr = srv.address();
      srv.close(() => (typeof addr === "object" && addr ? resolve(addr.port) : reject(new Error("no port"))));
    });
  });
}

/** Newest file time under a folder; a build older than the code it serves would record yesterday's screens. */
function newest(dir: string): number {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }
  return t;
}

/**
 * A phone sheet still rising (200ms) comes out half faded (I-163): let those finish, as e2e/qa/checks.ts does. Not
 * the kiosk's 2 s highlight, which the AI-change pictures are meant to catch.
 */
export async function sheetsSettled(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a instanceof CSSAnimation && (a.animationName === "kibo-sheet-in" || a.animationName === "kibo-fade-in"))
        .map((a) => a.finished.catch(() => {})),
    ),
  );
}

export async function startShotsServer(port?: number): Promise<{ base: string; mode: "production" | "dev"; stop(): void }> {
  const p = port ?? (await freePort());
  const env = { ...process.env, STORE: "memory", SHORT_APP_URL };
  let server: ChildProcess;
  let mode: "production" | "dev";
  if (process.env.SHOTS_DEV === "1") {
    mode = "dev";
    server = spawn("npx", ["next", "dev", "--port", String(p)], { env: { ...env, KIBO_DEV_CACHE: "off" }, stdio: "ignore", detached: true });
  } else {
    mode = "production";
    const standalone = join(ROOT, ".next/standalone");
    if (!existsSync(join(standalone, "server.js"))) throw new Error("No production build: run `npm run build` first (or SHOTS_DEV=1).");
    const built = statSync(join(ROOT, ".next/BUILD_ID")).mtimeMs;
    const changed = ["src", "data", "skills"].find((d) => newest(join(ROOT, d)) > built);
    if (changed) throw new Error(`The production build is older than ${changed}/: run \`npm run build\` first.`);
    // The standalone server does not include static assets (the Dockerfile does the same copy).
    cpSync(join(ROOT, "public"), join(standalone, "public"), { recursive: true });
    cpSync(join(ROOT, ".next/static"), join(standalone, ".next/static"), { recursive: true });
    server = spawn(process.execPath, [join(standalone, "server.js")], {
      cwd: standalone,
      env: { ...env, NODE_ENV: "production", PORT: String(p), HOSTNAME: "localhost", ALLOW_MEMORY_STORE: "1" },
      stdio: "ignore",
      detached: true,
    });
  }
  const base = `http://localhost:${p}`;
  for (let i = 0; ; i++) {
    if (server.exitCode !== null) throw new Error(`${mode} server exited (${server.exitCode})`);
    if ((await fetch(`${base}/api/health`).then((r) => r.ok, () => false))) break;
    if (i > 240) throw new Error(`${mode} server did not start`);
    await new Promise((r) => setTimeout(r, 500));
  }
  return {
    base,
    mode,
    stop: () => {
      if (server.pid) process.kill(-server.pid);
    },
  };
}
