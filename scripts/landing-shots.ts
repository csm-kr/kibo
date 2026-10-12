import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";

// Real product screenshots for the landing page (`npm run shots:landing`). Starts its own dev server with the
// in-memory store, drives every state through the API the way the E2E specs do (no model calls), and writes
// .webp files to public/landing/. Never mockups: every image is the running app.

const PORT = 3300;
const BASE = `http://localhost:${PORT}`;
const OUT = "public/landing";
/** Each image must stay under this size (the step's budget). */
const MAX_BYTES = 300 * 1024;

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

async function api<T>(path: string, body: object, token?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${path}: ${JSON.stringify(json.error)}`);
  return json as T;
}

/** The phone's AI tool call, as /api/chat or Gemini Live would send it. */
function phoneAi(sessionId: string, deviceToken: string) {
  return (type: string, args: object, utteranceSeq: number) =>
    api("/api/command", { sessionId, commandId: randomUUID(), type, args, source: "voice", utteranceSeq }, deviceToken);
}

const heroLines = [
  { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"], ingredients: ["no_pickles"] } },
  { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["cider"] } },
];

/** Waits for web fonts and every image on the page, so no photo is caught half-loaded. */
async function settled(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
}

/** Re-encodes a PNG screenshot as WebP at the given size, in the browser's own encoder (no extra dependency). */
async function saveWebp(encoder: Page, png: Buffer, name: string, width: number, height: number) {
  const dataUrl = await encoder.evaluate(
    async ({ src, width, height }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);
      return canvas.toDataURL("image/webp", 0.82);
    },
    { src: `data:image/png;base64,${png.toString("base64")}`, width, height },
  );
  const path = `${OUT}/${name}.webp`;
  writeFileSync(path, Buffer.from(dataUrl.split(",")[1], "base64"));
  const bytes = statSync(path).size;
  console.log(`${path} ${width}x${height} ${Math.round(bytes / 1024)} KB`);
  if (bytes > MAX_BYTES) throw new Error(`${path} is over ${MAX_BYTES / 1024} KB`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = spawn("npx", ["next", "dev", "--port", String(PORT)], {
    env: { ...process.env, STORE: "memory", KIBO_DEV_CACHE: "off" },
    stdio: "ignore",
    detached: true,
  });
  const browser = await chromium.launch();
  try {
    await waitForServer();
    const encoder = await browser.newPage();

    // Kiosk: K1 attract with the QR, then K3 with the AI highlight right after the phone's two lines.
    const kioskCtx = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
    const kiosk = await kioskCtx.newPage();
    await kiosk.goto(`${BASE}/kiosk?k=malo`);
    const qr = kiosk.locator("img[data-claim-url]");
    await qr.waitFor({ timeout: 120_000 });
    await kiosk.getByRole("button", { name: /화면을 눌러서 주문/ }).and(kiosk.locator(":enabled")).waitFor();
    await settled(kiosk);
    await saveWebp(encoder, await kiosk.screenshot(), "kiosk-attract", 540, 960);

    const claimUrl = new URL((await qr.getAttribute("data-claim-url")) ?? "");
    const sessionId = claimUrl.searchParams.get("s") ?? "";
    const claimed = await api<{ deviceToken: string }>("/api/session/claim", {
      sessionId,
      claimToken: claimUrl.hash.replace(/^#t=/, ""),
    });
    const kioskAi = phoneAi(sessionId, claimed.deviceToken);
    await kioskAi("setDineOption", { option: "eat_in" }, 1);
    await kiosk.locator('[data-screen="menu"]').waitFor();
    await kioskAi("addToCart", heroLines[0], 2);
    await kioskAi("addToCart", heroLines[1], 2);
    // Taken inside the 2 s highlight of the second line.
    await kiosk.locator(".k-ring").first().waitFor();
    await settled(kiosk);
    await saveWebp(encoder, await kiosk.screenshot(), "kiosk-ai-highlight", 540, 960);
    await kioskCtx.close();

    // Phone: P3 with the two-line cart, then P4 the confirm card. Text mode, so no Live connection is opened.
    const phoneCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      locale: "en-US",
      isMobile: true,
      hasTouch: true,
    });
    const phone = await phoneCtx.newPage();
    const created = await api<{ sessionId: string; claimUrl: string }>("/api/session", { kioskId: "malo" });
    await phone.goto(created.claimUrl.replace(/^https?:\/\/[^/]+/, BASE));
    const key = `kibo.phone.${created.sessionId}`;
    await phone.waitForFunction((k) => localStorage.getItem(k) !== null, key, { timeout: 60_000 });
    const deviceToken = (await phone.evaluate((k) => localStorage.getItem(k), key)) ?? "";
    await phone.getByRole("button", { name: "Start" }).click();
    await phone.getByRole("button", { name: "Type instead" }).click();
    await phone.getByRole("button", { name: "Eat here" }).click();
    await phone.locator('[data-phone-screen="talk"]').waitFor();
    const ai = phoneAi(created.sessionId, deviceToken);
    await ai("addToCart", heroLines[0], 1);
    await ai("addToCart", heroLines[1], 1);
    await phone.getByRole("region", { name: "Your order" }).locator("li").nth(1).waitFor();
    await phone.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await settled(phone);
    await saveWebp(encoder, await phone.screenshot(), "phone-talk", 780, 1688);

    await ai("requestCheckout", {}, 2);
    await phone.getByRole("heading", { name: "Please check your order" }).waitFor();
    await settled(phone);
    await phone.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await saveWebp(encoder, await phone.screenshot(), "phone-confirm", 780, 1688);
    await phoneCtx.close();

    // /demo mid-order at the judge laptop size, inside the highlight of the second line.
    const demoCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
    const demo = await demoCtx.newPage();
    await demo.goto(`${BASE}/demo`);
    const started = demo.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST");
    await demo.getByRole("button", { name: "Start", exact: true }).click({ timeout: 120_000 });
    const s = (await (await started).json()) as { sessionId: string; deviceToken: string };
    await demo.locator('[data-phone-screen="dine"]').waitFor();
    const demoAi = phoneAi(s.sessionId, s.deviceToken);
    await demoAi("setDineOption", { option: "eat_in" }, 1);
    await demoAi("addToCart", heroLines[0], 2);
    await demoAi("addToCart", heroLines[1], 2);
    await demo.getByRole("region", { name: "Your order" }).locator("li").nth(1).waitFor();
    await demo.locator(".k-ring").first().waitFor();
    await settled(demo);
    await demo.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await saveWebp(encoder, await demo.screenshot(), "demo", 1440, 900);
    await demoCtx.close();
  } finally {
    await browser.close();
    if (server.pid) process.kill(-server.pid);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
