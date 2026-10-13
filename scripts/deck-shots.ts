import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import sharp from "sharp";

// Real captures for the submission deck (`npm run shots:deck`, docs/plan/DECK_FACTS.md). Starts its own dev server
// with the in-memory store and writes PNGs (and the architecture SVG) to docs/assets/deck/. Slot 7 wireframes are
// driven through the API like scripts/landing-shots.ts (no model). Slot 11 /demo snapshots tap a scenario's first
// sentence, which goes to real Gemini through /api/chat, so "What the AI did" lists real tool calls. Never mockups.

const OUT = "docs/assets/deck";
/** Each PNG must stay under this size (the step's budget). */
const MAX_BYTES = 600 * 1024;
const MODEL_TIMEOUT_MS = 90_000;
let BASE = "";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, () => {
      const addr = srv.address();
      srv.close(() => (typeof addr === "object" && addr ? resolve(addr.port) : reject(new Error("no port"))));
    });
  });
}

async function waitForServer() {
  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("dev server did not start");
}

/** Own addresses for the dev server's per-IP limits (R-005). */
const xff = (n: number) => ({ "X-Forwarded-For": `192.0.2.${150 + n}` });

async function api<T>(path: string, body: object, headers: Record<string, string>, token?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${path}: ${json.error?.code ?? res.status}`);
  return json as T;
}

/** The phone's AI tool call, as /api/chat or Gemini Live would send it. */
function phoneAi(sessionId: string, deviceToken: string, headers: Record<string, string>) {
  return <T = { cartVersion: number }>(type: string, args: object, extra: object) =>
    api<T>("/api/command", { sessionId, commandId: randomUUID(), type, args, ...extra }, headers, deviceToken);
}

const heroLines = [
  { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"], ingredients: ["no_pickles"] } },
  { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["cider"] } },
];

/** Fonts and every on-screen image loaded, and no stray focus ring. */
async function settled(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0), null, { timeout: 15_000 });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/** Palette PNG (lossy colour reduction, lossless shapes), lowering quality until it fits the budget. */
async function savePng(png: Buffer, name: string, resize?: { width?: number; height?: number }) {
  const path = join(OUT, `${name}.png`);
  for (const quality of [90, 80, 70, 60]) {
    const img = sharp(png);
    if (resize) img.resize({ ...resize, kernel: "lanczos3" });
    const { data, info } = await img.png({ palette: true, quality, effort: 10, compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
    if (data.length > MAX_BYTES) continue;
    writeFileSync(path, data);
    console.log(`${path} ${info.width}x${info.height} ${Math.round(data.length / 1024)} KB (quality ${quality})`);
    return;
  }
  throw new Error(`${path} stays over ${MAX_BYTES / 1024} KB`);
}

async function context(browser: Browser, n: number, opts: BrowserContextOptions) {
  return browser.newContext({ ...opts, extraHTTPHeaders: xff(n) });
}

const PHONE: BrowserContextOptions = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "en-US", isMobile: true, hasTouch: true };

/** Slot 7: phone P3 (two lines), P4 (confirm card), P6 (order number). */
async function phoneWireframes(browser: Browser) {
  const headers = xff(0);
  const ctx = await context(browser, 0, PHONE);
  const page = await ctx.newPage();
  const created = await api<{ sessionId: string; claimUrl: string; kioskToken: string }>("/api/session", { kioskId: "malo" }, headers);
  await page.goto(created.claimUrl.replace(/^https?:\/\/[^/]+/, BASE));
  const key = `kibo.phone.${created.sessionId}`;
  await page.waitForFunction((k) => localStorage.getItem(k) !== null, key, { timeout: 60_000 });
  const deviceToken = (await page.evaluate((k) => localStorage.getItem(k), key)) ?? "";
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Type instead" }).click();
  await page.getByRole("button", { name: "Eat here" }).click();
  await page.locator('[data-phone-screen="talk"]').waitFor();
  const ai = phoneAi(created.sessionId, deviceToken, headers);
  await ai("addToCart", heroLines[0], { source: "voice", utteranceSeq: 1 });
  await ai("addToCart", heroLines[1], { source: "voice", utteranceSeq: 1 });
  await page.getByRole("region", { name: "Your order" }).locator("li").nth(1).waitFor();
  await settled(page);
  await savePng(await page.screenshot(), "wireframe-phone-P3-talk");

  const review = await ai("requestCheckout", {}, { source: "voice", utteranceSeq: 2 });
  await page.getByRole("heading", { name: "Please check your order" }).waitFor();
  await settled(page);
  await savePng(await page.screenshot(), "wireframe-phone-P4-confirm");

  await ai("confirmCheckout", {}, { source: "button", cartVersion: review.cartVersion });
  await page.getByRole("heading", { name: "Insert your card into the kiosk" }).waitFor();
  await api("/api/command", { sessionId: created.sessionId, commandId: randomUUID(), type: "cardAction", args: {}, source: "touch" }, headers, created.kioskToken);
  await page.getByRole("heading", { name: "Order number" }).waitFor({ timeout: 30_000 });
  await settled(page);
  await savePng(await page.screenshot(), "wireframe-phone-P6-order-number");
  await ctx.close();
}

/** Slot 7: kiosk K1 (attract), K3 (menu right after the AI added two lines), K6 (order review), scaled to 1080 high. */
async function kioskWireframes(browser: Browser) {
  const headers = xff(1);
  const ctx = await context(browser, 1, { viewport: { width: 1080, height: 1920 } });
  const page = await ctx.newPage();
  const scaled = { height: 1080 };
  await page.goto(`${BASE}/kiosk?k=malo`);
  const qr = page.locator("img[data-claim-url]");
  await qr.waitFor({ timeout: 120_000 });
  await page.getByRole("button", { name: /화면을 눌러서 주문/ }).and(page.locator(":enabled")).waitFor();
  await settled(page);
  await savePng(await page.screenshot(), "wireframe-kiosk-K1-attract", scaled);

  const claimUrl = new URL((await qr.getAttribute("data-claim-url")) ?? "");
  const sessionId = claimUrl.searchParams.get("s") ?? "";
  const { deviceToken } = await api<{ deviceToken: string }>("/api/session/claim", { sessionId, claimToken: claimUrl.hash.replace(/^#t=/, "") }, headers);
  const ai = phoneAi(sessionId, deviceToken, headers);
  await ai("setDineOption", { option: "eat_in" }, { source: "voice", utteranceSeq: 1 });
  await page.locator('[data-screen="menu"]').waitFor();
  await ai("addToCart", heroLines[0], { source: "voice", utteranceSeq: 2 });
  await ai("addToCart", heroLines[1], { source: "voice", utteranceSeq: 2 });
  // Inside the 2 s highlight of the second line.
  await page.locator(".k-ring").first().waitFor();
  await settled(page);
  await savePng(await page.screenshot(), "wireframe-kiosk-K3-menu-ai-added", scaled);

  await ai("requestCheckout", {}, { source: "voice", utteranceSeq: 3 });
  await page.locator('[data-screen="review"]').waitFor();
  await settled(page);
  await savePng(await page.screenshot(), "wireframe-kiosk-K6-review", scaled);
  await ctx.close();
}

/** Slot 11: /demo at 1920×1080 after the first sentence of a scenario, with the guide and "What the AI did" open. */
async function demoSnapshot(browser: Browser, n: number, kioskId: string, scenarioId: string, dine: boolean) {
  for (let attempt = 1; ; attempt++) {
    const ctx = await context(browser, n, { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, locale: "en-US" });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/demo?k=${kioskId}`);
      await page.getByRole("button", { name: "Start", exact: true }).click({ timeout: 120_000 });
      const guide = page.locator("[data-scenario-guide]");
      const toggle = guide.getByRole("button", { name: "Scenarios", exact: true });
      if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
      await page.locator(`[data-scenario="${scenarioId}"]`).click();
      if (dine) {
        await page.locator("[data-phone-screen]").getByRole("button", { name: "Eat here" }).click();
        // The guide enables [Play it for me] once the dine option is in the session (on a learned kiosk, after the
        // bridge replayed it); a sentence sent earlier would meet "the kiosk is still working".
        await guide.getByRole("button", { name: "Play it for me" }).and(page.locator(":enabled")).waitFor({ timeout: 30_000 });
      }
      const step = page.locator('[data-scenario-step="0"]');
      const answered = page.waitForResponse((r) => r.url().endsWith("/api/chat") && r.request().method() === "POST", { timeout: MODEL_TIMEOUT_MS });
      await step.getByRole("button").and(page.locator(":enabled")).click({ timeout: 30_000 });
      const res = await answered;
      if (!(await res.json()).ok) throw new Error(`/api/chat: ${res.status()}`);
      await page.locator('[data-scenario-step="0"][data-done="true"]').waitFor({ timeout: MODEL_TIMEOUT_MS });
      const strip = page.locator("[data-action-strip]");
      const stripToggle = strip.locator("button[aria-expanded]").first();
      if ((await stripToggle.getAttribute("aria-expanded")) === "false") await stripToggle.click();
      await strip.locator("[data-action-tool]").first().waitFor();
      await settled(page);
      await savePng(await page.screenshot(), `snapshot-demo-${kioskId}-1920x1080`);
      if (kioskId === "malo") await savePng(await guide.screenshot(), "snapshot-demo-malo-guide-and-ai-actions");
      await ctx.close();
      return;
    } catch (e) {
      await ctx.close();
      // One retry, for a model call that fails or times out.
      if (attempt >= 2) throw e;
      console.log(`${kioskId}: retrying after ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
  }
}

/** Slot 8: the landing page's architecture diagram (docs/ARCHITECTURE.md "Deployment"), as SVG and as a 2400 px PNG. */
async function architecture(browser: Browser) {
  const ctx = await context(browser, 5, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  const svg = page.locator('[data-landing-section="cloud"] svg[role="img"]');
  await svg.scrollIntoViewIfNeeded();
  await settled(page);
  await savePng(await svg.screenshot(), "architecture", { width: 2400 });
  const markup = await svg.evaluate((el) => {
    const copy = el.cloneNode(true) as SVGSVGElement;
    copy.removeAttribute("class");
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", "1000");
    copy.setAttribute("height", "424");
    copy.setAttribute("font-family", "'IBM Plex Sans KR', 'Helvetica Neue', Arial, sans-serif");
    // A white ground, as on the page, so the file reads on dark slides too.
    const ground = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    for (const [k, v] of Object.entries({ width: "1000", height: "424", fill: "#FFFFFF" })) ground.setAttribute(k, v);
    copy.insertBefore(ground, copy.querySelector("defs")?.nextSibling ?? copy.firstChild);
    return copy.outerHTML;
  });
  const path = join(OUT, "architecture.svg");
  writeFileSync(path, `<?xml version="1.0" encoding="UTF-8"?>\n${markup}\n`);
  console.log(`${path} ${Math.round(statSync(path).size / 1024)} KB`);
  await ctx.close();
}

/** The dev server compiles each route on first use and may reload the page meanwhile; load each once first. */
async function warm(browser: Browser) {
  const ctx = await context(browser, 9, {});
  const page = await ctx.newPage();
  for (const path of ["/", "/demo?k=malo", "/demo?k=airport_rail", "/demo?k=doughhouse", "/kiosk?k=malo", "/assistant"]) {
    await page.goto(`${BASE}${path}`, { timeout: 180_000 });
    await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  }
  await ctx.close();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  BASE = `http://localhost:${await freePort()}`;
  const server = spawn("npx", ["next", "dev", "--port", BASE.split(":").pop() ?? ""], {
    env: { ...process.env, STORE: "memory", KIBO_DEV_CACHE: "off" },
    stdio: "ignore",
    detached: true,
  });
  const browser = await chromium.launch();
  try {
    await waitForServer();
    await warm(browser);
    await phoneWireframes(browser);
    await kioskWireframes(browser);
    await architecture(browser);
    await demoSnapshot(browser, 2, "malo", "sunja-lunch", true);
    await demoSnapshot(browser, 3, "airport_rail", "mei-tickets", false);
    await demoSnapshot(browser, 4, "doughhouse", "learned-pizza", true);
  } finally {
    await browser.close();
    if (server.pid) process.kill(-server.pid);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
