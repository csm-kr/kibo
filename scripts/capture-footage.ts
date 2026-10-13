import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import { scenariosFor, stepDone, type StepCheck } from "@/lib/demo/scenarios";
import type { Session } from "@/types/session";

// Screen footage of the real app for the demo video (`npm run capture:footage`, docs/plan/FOOTAGE.md). Starts its own
// dev server with the in-memory store, or records FOOTAGE_URL (e.g. the deployed app). Typed orders go to real Gemini
// through /api/chat; nothing is mocked. Writes only to videos/footage/<date>/ (git-ignored): one .webm per clip, a PNG
// at every key moment and manifest.json. `npm run capture:footage -- <clip name>…` re-records only those clips.

const DATE = new Date().toLocaleDateString("sv-SE");
const OUT = join("videos", "footage", DATE);
const RAW = join(OUT, ".raw");
/** About 12 characters a second, a calm typist. */
const TYPE_DELAY_MS = 83;
/** Room for the edit after each kiosk change. */
const HOLD_MS = 1500;
/** A tap on the touch kiosk, at a pace a viewer can follow. */
const TAP_GAP_MS = 600;
const MODEL_TIMEOUT_MS = 90_000;

const MODELS = {
  text: process.env.GEMINI_TEXT_MODEL ?? "gemini-3.8-flash",
  live: process.env.GEMINI_LIVE_MODEL ?? "gemini-3.8-live",
};

interface Mark {
  name: string;
  atMs: number;
  shot: string;
}

interface ClipResult {
  name: string;
  file: string | null;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  route: string;
  usesModel: boolean;
  ok: boolean;
  attempts: number;
  errors: string[];
  durationMs: number;
  bytes: number;
  note?: string;
  recordedAt: string;
  steps: Mark[];
}

interface Clip {
  name: string;
  route: string;
  usesModel: boolean;
  note?: string;
  context: BrowserContextOptions & { viewport: { width: number; height: number } };
  run(page: Page, rec: Recorder): Promise<void>;
}

class Recorder {
  readonly steps: Mark[] = [];
  private readonly t0 = Date.now();
  constructor(
    private readonly page: Page,
    private readonly clip: string,
  ) {}

  /** A key moment: timestamp, full-resolution screenshot, then a hold so the edit has room. */
  async mark(name: string, hold = HOLD_MS) {
    await this.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    // Menu photos still loading came out blank (I-147), as in e2e/qa/checks.ts screenshot() (I-138).
    await this.page
      .waitForFunction(
        () =>
          [...document.images].every((img) => {
            const b = img.getBoundingClientRect();
            const onScreen = b.width > 0 && b.bottom > 0 && b.right > 0 && b.top < innerHeight && b.left < innerWidth;
            return !onScreen || (img.complete && img.naturalWidth > 0);
          }),
        null,
        { timeout: 5_000 },
      )
      .catch(() => {});
    await this.page.evaluate(() =>
      Promise.all([...document.images].filter((img) => img.complete && img.naturalWidth > 0).map((img) => img.decode().catch(() => {}))),
    );
    // After the wait, so the edit's timestamp shows the same frame as the screenshot.
    const atMs = Date.now() - this.t0;
    const shot = `${this.clip}--${String(this.steps.length + 1).padStart(2, "0")}-${name}.png`;
    await this.page.screenshot({ path: join(OUT, shot) });
    this.steps.push({ name, atMs, shot });
    if (hold) await this.page.waitForTimeout(hold);
  }
}

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

async function waitForServer(base: string) {
  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("dev server did not start");
}

let BASE = "";

/** Each clip has its own address for the dev server's per-IP limits (on Cloud Run the last hop wins, so it is ignored). */
function xff(clip: Clip) {
  return { "X-Forwarded-For": `192.0.2.${200 + CLIPS.indexOf(clip)}` };
}

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

/** Follows the session through the same SSE stream the screens read, so waits are on server state, not on pixels. */
function watchSession(sessionId: string, headers: Record<string, string>) {
  let latest: Session | null = null;
  const waiters = new Set<() => void>();
  const abort = new AbortController();
  void (async () => {
    try {
      const res = await fetch(`${BASE}/api/session/${sessionId}/events`, { headers, signal: abort.signal });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6));
          if (data && data.sessionId) {
            latest = data as Session;
            waiters.forEach((w) => w());
          }
        }
      }
    } catch {
      // Aborted at the end of the clip.
    }
  })();
  return {
    async until(what: string, pred: (s: Session) => boolean, timeout = MODEL_TIMEOUT_MS): Promise<Session> {
      const deadline = Date.now() + timeout;
      while (!(latest && pred(latest))) {
        const left = deadline - Date.now();
        if (left <= 0) throw new Error(`timed out waiting for: ${what}`);
        await new Promise<void>((resolve) => {
          const done = () => {
            waiters.delete(done);
            clearTimeout(timer);
            resolve();
          };
          const timer = setTimeout(done, Math.min(left, 1000));
          waiters.add(done);
        });
      }
      return latest;
    },
    close: () => abort.abort(),
  };
}

const check = (c: StepCheck) => (s: Session) => stepDone(s, c);
const status = (st: Session["status"]) => (s: Session) => s.status === st;

/** Types a message into the phone at a human pace, sends it, and waits for /api/chat to answer (real Gemini). */
async function say(page: Page, text: string): Promise<Session["status"]> {
  const input = page.getByRole("textbox", { name: "Type your order" });
  await input.click();
  await input.pressSequentially(text, { delay: TYPE_DELAY_MS });
  const send = page.getByRole("button", { name: "Send", exact: true });
  await send.and(page.locator(":enabled")).waitFor({ timeout: MODEL_TIMEOUT_MS });
  const answered = page.waitForResponse((r) => r.url().endsWith("/api/chat") && r.request().method() === "POST", {
    timeout: MODEL_TIMEOUT_MS,
  });
  await send.click();
  const res = await answered;
  const json = (await res.json()) as { ok: boolean; status: Session["status"]; error?: { code: string } };
  if (!json.ok) throw new Error(`/api/chat "${text}": ${json.error?.code ?? res.status()}`);
  return json.status;
}

/** Declines dessert. The model may take "No thanks" as "that is all" and open the review itself; only then is "I'll pay." skipped. */
async function noThanksThenPay(page: Page, rec: Recorder) {
  if ((await say(page, "No thanks.")) === "confirming") return;
  await rec.mark("no-dessert");
  await say(page, "I'll pay.");
}

/** Clicks Start (or a scenario) on /demo and returns the session it created. */
async function newDemoSession(page: Page, click: () => Promise<void>) {
  const created = page.waitForResponse((r) => r.url().endsWith("/api/session") && r.request().method() === "POST", {
    timeout: 120_000,
  });
  await click();
  const json = (await (await created).json()) as { ok: boolean; sessionId: string; kioskToken: string; deviceToken: string };
  if (!json.ok) throw new Error("/api/session failed");
  return json;
}

async function tap(page: Page, locator: ReturnType<Page["locator"]>) {
  await locator.click();
  await page.waitForTimeout(TAP_GAP_MS);
}

/** A button that holds an element with exactly this text (tile and option names are not unique prefixes). */
function buttonWithText(scope: Page | ReturnType<Page["locator"]>, page: Page, text: string) {
  return scope.locator("button").filter({ has: page.getByText(text, { exact: true }) });
}

/** Cheeseburger → set → side → drink → ingredients → 담기, as in e2e/helpers.ts addCheeseburgerSet. */
async function touchCheeseburgerSet(page: Page, side: string, drink: string, noPickles: boolean) {
  await tap(page, buttonWithText(page, page, "치즈버거"));
  const sheet = page.getByRole("dialog", { name: "치즈버거" });
  await sheet.waitFor();
  const next = sheet.getByRole("button", { name: "다음", exact: true });
  await tap(page, buttonWithText(sheet, page, "세트"));
  await tap(page, next);
  const fries = buttonWithText(sheet, page, side);
  if ((await fries.getAttribute("aria-pressed")) !== "true") await tap(page, fries);
  await tap(page, next);
  await tap(page, buttonWithText(sheet, page, drink));
  await tap(page, next);
  if (noPickles) await tap(page, buttonWithText(sheet, page, "피클 빼기"));
  await tap(page, sheet.getByRole("button", { name: "담기", exact: true }));
  await sheet.waitFor({ state: "hidden" });
}

/** The kiosk's receipt question, if this kiosk asks one. */
async function skipReceipt(page: Page) {
  const no = page.getByRole("button", { name: "출력 안 함" });
  try {
    await no.waitFor({ timeout: 8_000 });
    await no.click();
  } catch {
    // No receipt question.
  }
}

const HERO = "Two cheeseburger sets. One without pickles; drinks zero cola and cider.";
const SUNJA = scenariosFor("malo").find((s) => s.id === "sunja-lunch")!;
const heroLines = check(SUNJA.steps[0].done);
const heroLarge = check(SUNJA.steps[1].done);

const DESKTOP = { viewport: { width: 1920, height: 1080 }, locale: "en-US" };
const KIOSK = { viewport: { width: 1080, height: 1920 } };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "en-US", isMobile: true, hasTouch: true };

/** One /demo scenario from scenariosFor, typed step by step; each step waits for its own check on the live session. */
function scenarioClip(name: string, kioskId: string, scenarioId: string, dine: boolean, payable: boolean, note?: string): Clip {
  const scenario = scenariosFor(kioskId).find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`no scenario ${kioskId}/${scenarioId}`);
  const clip: Clip = {
    name,
    route: `/demo?k=${kioskId}`,
    usesModel: true,
    note,
    context: DESKTOP,
    async run(page, rec) {
      await page.goto(`${BASE}/demo?k=${kioskId}`);
      await page.getByRole("button", { name: "Start", exact: true }).waitFor({ timeout: 120_000 });
      await rec.mark("intro");
      await newDemoSession(page, () => page.getByRole("button", { name: "Start", exact: true }).click());
      const toggle = page.locator("[data-scenario-guide]").getByRole("button", { name: "Scenarios", exact: true });
      if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
      const s = await newDemoSession(page, () => page.locator(`[data-scenario="${scenarioId}"]`).click());
      const watch = watchSession(s.sessionId, xff(clip));
      try {
        await rec.mark("scenario-chosen");
        if (dine) {
          await page.locator("[data-phone-screen]").getByRole("button", { name: "Eat here" }).click();
          await watch.until("dine option", (x) => x.dineOption !== null);
          await rec.mark("dine");
        }
        for (const [i, step] of scenario.steps.entries()) {
          await say(page, step.say.en);
          await watch.until(`step ${i + 1}`, check(step.done));
          await page.locator(`[data-scenario-step="${i}"][data-done="true"]`).waitFor();
          await rec.mark(`step-${i + 1}`);
        }
        if (!payable) {
          await page.locator("[data-demo-end]").waitFor();
          await rec.mark("end-at-review", 3000);
          return;
        }
        await page.getByRole("button", { name: "Yes, pay now" }).click();
        await watch.until("paying", status("paying"), 15_000);
        await rec.mark("paying");
        await page.getByRole("button", { name: "Insert the card at the kiosk" }).click();
        await watch.until("paid", status("paid"), 30_000);
        await rec.mark("paid");
        await skipReceipt(page);
        await page.locator("[data-demo-end]").waitFor();
        await rec.mark("done", 3000);
      } finally {
        watch.close();
      }
    },
  };
  return clip;
}

const CLIPS: Clip[] = [
  {
    name: "demo-hero-1920x1080",
    route: "/demo?k=malo",
    usesModel: true,
    context: DESKTOP,
    async run(page, rec) {
      await page.goto(`${BASE}/demo?k=malo`);
      await page.getByRole("heading", { name: "Don't learn the kiosk. Just talk." }).waitFor({ timeout: 120_000 });
      await rec.mark("intro");
      const s = await newDemoSession(page, () => page.getByRole("button", { name: "Start", exact: true }).click());
      const watch = watchSession(s.sessionId, xff(this));
      try {
        await page.locator('[data-phone-screen="dine"]').waitFor();
        await rec.mark("start");
        await page.locator("[data-phone-screen]").getByRole("button", { name: "Eat here" }).click();
        await watch.until("dine option", (x) => x.dineOption !== null);
        await rec.mark("dine");
        await say(page, HERO);
        await watch.until("two cheeseburger sets", heroLines);
        await rec.mark("hero-lines");
        await say(page, "Make both fries large.");
        await watch.until("both fries large", heroLarge);
        await rec.mark("fries-large");
        await noThanksThenPay(page, rec);
        await watch.until("confirm card", status("confirming"));
        await rec.mark("confirm");
        await page.getByRole("button", { name: "Yes, pay now" }).click();
        await watch.until("paying", status("paying"), 15_000);
        await rec.mark("paying");
        await page.getByRole("button", { name: "Insert the card at the kiosk" }).click();
        await watch.until("paid", status("paid"), 30_000);
        await rec.mark("paid");
        await skipReceipt(page);
        await page.locator("[data-demo-end]").waitFor();
        await rec.mark("order-number", 3000);
      } finally {
        watch.close();
      }
    },
  },
  {
    name: "kiosk-touch-1080x1920",
    route: "/kiosk?k=malo&demo=1",
    usesModel: false,
    // The path the /demo card and deck cite (24 taps, I-143); the 41-tap edit path of e2e/kiosk-touch.spec.ts is a footnote only.
    note: "Efficient path of e2e/kiosk-touch-efficient.spec.ts (large fries chosen while adding each set), the 24-tap path the /demo card and deck cite (evidence/touch-hero-efficient.json).",
    context: KIOSK,
    async run(page, rec) {
      await page.goto(`${BASE}/kiosk?k=malo&demo=1`);
      const start = page.getByRole("button", { name: /화면을 눌러서 주문/ }).and(page.locator(":enabled"));
      await start.waitFor({ timeout: 120_000 });
      await rec.mark("attract");
      await tap(page, start);
      await tap(page, page.getByRole("button", { name: "매장에서 먹기" }));
      await tap(page, page.getByRole("button", { name: "버거", exact: true }));
      await rec.mark("menu", 0);
      await touchCheeseburgerSet(page, "감자튀김 L", "제로콜라", true);
      const upsell = page.getByRole("dialog", { name: "디저트도 함께 드릴까요?" });
      await upsell.waitFor();
      await rec.mark("upsell", 0);
      await tap(page, upsell.getByRole("button", { name: "괜찮아요" }));
      await touchCheeseburgerSet(page, "감자튀김 L", "사이다", false);
      await rec.mark("two-sets-large", 0);
      await tap(page, page.getByRole("button", { name: "주문하기", exact: true }));
      await page.locator('[data-screen="review"]').waitFor();
      await rec.mark("review", 0);
      await tap(page, page.getByRole("button", { name: "결제하기" }));
      await tap(page, page.getByRole("button", { name: "카드", exact: true }));
      await tap(page, page.getByRole("button", { name: "카드 넣기" }));
      await page.locator('[data-screen="done"]').waitFor({ timeout: 30_000 });
      await tap(page, page.getByRole("button", { name: "출력 안 함" }));
      await page.getByRole("heading", { name: "주문 번호" }).waitFor();
      // The same tap count as the cited run, so the clip's counter never contradicts the card.
      const taps = Number(await page.locator("[data-demo-counter]").getAttribute("data-taps"));
      if (taps !== 24) throw new Error(`touch clip took ${taps} taps, the cited efficient path is 24`);
      await rec.mark("order-number", 3000);
    },
  },
  {
    name: "kiosk-mirror-1080x1920",
    route: "/kiosk?k=malo",
    usesModel: false,
    note: "The phone is API calls with the claimed device token and source voice, the calls a phone's AI makes; no model.",
    context: KIOSK,
    async run(page, rec) {
      await page.goto(`${BASE}/kiosk?k=malo`);
      const qr = page.locator("img[data-claim-url]");
      await qr.waitFor({ timeout: 120_000 });
      await page.getByRole("button", { name: /화면을 눌러서 주문/ }).and(page.locator(":enabled")).waitFor();
      await rec.mark("attract");
      const url = new URL((await qr.getAttribute("data-claim-url")) ?? "");
      const sessionId = url.searchParams.get("s") ?? "";
      const headers = xff(this);
      const { deviceToken } = await api<{ deviceToken: string }>(
        "/api/session/claim",
        { sessionId, claimToken: url.hash.replace(/^#t=/, "") },
        headers,
      );
      await page.locator('[data-screen="dine"]').waitFor();
      await rec.mark("phone-connected");
      type Reply = { cart: { lineId: string }[]; cartVersion: number };
      const ai = (type: string, args: object, extra: object) =>
        api<Reply>("/api/command", { sessionId, commandId: randomUUID(), type, args, ...extra }, headers, deviceToken);
      await ai("setDineOption", { option: "eat_in" }, { source: "voice", utteranceSeq: 1 });
      await page.locator('[data-screen="menu"]').waitFor();
      await ai(
        "addToCart",
        { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"], ingredients: ["no_pickles"] } },
        { source: "voice", utteranceSeq: 2 },
      );
      const added = await ai(
        "addToCart",
        { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["cider"] } },
        { source: "voice", utteranceSeq: 2 },
      );
      await page.locator(".k-ring").first().waitFor();
      await rec.mark("ai-added", 2500);
      for (const line of added.cart) {
        await ai("updateCart", { lineId: line.lineId, changes: { selections: { side: ["fries_l"] } } }, { source: "voice", utteranceSeq: 3 });
      }
      await page.locator(".k-ring").first().waitFor();
      await rec.mark("ai-changed", 2500);
      const review = await ai("requestCheckout", {}, { source: "voice", utteranceSeq: 4 });
      await page.locator('[data-screen="review"]').waitFor();
      await rec.mark("review");
      await ai("confirmCheckout", {}, { source: "button", cartVersion: review.cartVersion });
      await page.locator('[data-screen="payment"]').waitFor();
      await rec.mark("payment", 0);
      await tap(page, page.getByRole("button", { name: "카드", exact: true }));
      await tap(page, page.getByRole("button", { name: "카드 넣기" }));
      await page.locator('[data-screen="done"]').waitFor({ timeout: 30_000 });
      await tap(page, page.getByRole("button", { name: "출력 안 함" }));
      await page.getByRole("heading", { name: "주문 번호" }).waitFor();
      await rec.mark("order-number", 3000);
    },
  },
  {
    name: "phone-390x844",
    route: "/assistant",
    usesModel: true,
    note: "Typed, not spoken: a real-device voice take is still needed for the hero shot. The card is inserted by the kiosk's own card action through the API.",
    context: PHONE,
    async run(page, rec) {
      const headers = xff(this);
      const created = await api<{ sessionId: string; claimUrl: string; kioskToken: string }>("/api/session", { kioskId: "malo" }, headers);
      const watch = watchSession(created.sessionId, headers);
      try {
        await page.goto(created.claimUrl.replace(/^https?:\/\/[^/]+/, BASE));
        await page.getByRole("heading", { name: "Tell your phone, and the kiosk orders for you" }).waitFor({ timeout: 120_000 });
        await rec.mark("start");
        await page.getByRole("button", { name: "Start" }).click();
        await page.getByRole("button", { name: "Type instead" }).click();
        await page.getByRole("button", { name: "Eat here" }).click();
        await watch.until("dine option", (x) => x.dineOption !== null);
        await page.locator('[data-phone-screen="talk"]').waitFor();
        await rec.mark("talk");
        await say(page, HERO);
        await watch.until("two cheeseburger sets", heroLines);
        await rec.mark("hero-lines");
        await say(page, "Make both fries large.");
        await watch.until("both fries large", heroLarge);
        await rec.mark("fries-large");
        await noThanksThenPay(page, rec);
        await watch.until("confirm card", status("confirming"));
        await rec.mark("confirm");
        await page.getByRole("button", { name: "Yes, pay now" }).click();
        await page.getByRole("heading", { name: "Insert your card into the kiosk" }).waitFor();
        await rec.mark("insert-card", 2500);
        await api("/api/command", { sessionId: created.sessionId, commandId: randomUUID(), type: "cardAction", args: {}, source: "touch" }, headers, created.kioskToken);
        await page.getByRole("heading", { name: "Order number" }).waitFor({ timeout: 30_000 });
        await rec.mark("order-number", 3000);
      } finally {
        watch.close();
      }
    },
  },
  scenarioClip("demo-airport-1920x1080", "airport_rail", "mei-tickets", false, true),
  scenarioClip(
    "demo-pizza-1920x1080",
    "doughhouse",
    "learned-pizza",
    true,
    false,
    "A learned kiosk ends at the review: the user pays on the kiosk itself, so there is nothing to tap through.",
  ),
];

/** The dev server compiles each route on first use and may reload the page meanwhile; load each once unrecorded. */
async function warm(browser: Browser) {
  const ctx = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": "192.0.2.199" } });
  const page = await ctx.newPage();
  for (const path of ["/demo?k=malo", "/demo?k=airport_rail", "/demo?k=doughhouse", "/kiosk?k=malo", "/assistant"]) {
    await page.goto(`${BASE}${path}`, { timeout: 180_000 });
    await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  }
  await Promise.all(
    ["/api/session/claim", "/api/ping", "/api/chat", "/api/command"].map((p) =>
      fetch(`${BASE}${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
    ),
  );
  await ctx.close();
}

async function record(browser: Browser, clip: Clip): Promise<ClipResult> {
  const result: ClipResult = {
    name: clip.name,
    file: null,
    viewport: clip.context.viewport,
    deviceScaleFactor: clip.context.deviceScaleFactor ?? 1,
    route: clip.route,
    usesModel: clip.usesModel,
    ok: false,
    attempts: 0,
    errors: [],
    durationMs: 0,
    bytes: 0,
    note: clip.note,
    recordedAt: new Date().toISOString(),
    steps: [],
  };
  // The video is recorded at the CSS viewport size: a larger size with a 2x device scale only pads a 1x picture into
  // the top-left corner. The screenshots keep the device scale.
  const { width, height } = clip.context.viewport;
  // One retry, for a model call that fails or times out.
  for (let attempt = 1; attempt <= 2 && !result.ok; attempt++) {
    result.attempts = attempt;
    const ctx = await browser.newContext({
      ...clip.context,
      extraHTTPHeaders: xff(clip),
      recordVideo: { dir: RAW, size: { width, height } },
    });
    const page = await ctx.newPage();
    const rec = new Recorder(page, clip.name);
    const started = Date.now();
    try {
      await clip.run(page, rec);
      result.ok = true;
    } catch (e) {
      result.errors.push(`attempt ${attempt}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
    result.durationMs = Date.now() - started;
    result.steps = rec.steps;
    const video = page.video();
    await ctx.close();
    const raw = video ? await video.path() : null;
    if (raw && result.ok) {
      const file = `${clip.name}.webm`;
      renameSync(raw, join(OUT, file));
      result.file = file;
      result.bytes = statSync(join(OUT, file)).size;
    } else if (raw) {
      rmSync(raw, { force: true });
    }
    console.log(`${clip.name}: ${result.ok ? "ok" : "failed"} (attempt ${attempt}, ${Math.round(result.durationMs / 1000)} s)`);
  }
  return result;
}

async function main() {
  // Clip names on the command line re-record only those clips and keep the rest of the day's take.
  const only = process.argv.slice(2);
  const unknown = only.filter((n) => !CLIPS.some((c) => c.name === n));
  if (unknown.length > 0) throw new Error(`unknown clip ${unknown.join(", ")}; clips: ${CLIPS.map((c) => c.name).join(", ")}`);
  const selected = only.length > 0 ? CLIPS.filter((c) => only.includes(c.name)) : CLIPS;
  const manifestPath = join(OUT, "manifest.json");
  let kept: ClipResult[] = [];
  if (only.length > 0) {
    if (existsSync(manifestPath)) {
      const old = JSON.parse(readFileSync(manifestPath, "utf8")) as { recordedAt: string; clips: ClipResult[] };
      kept = old.clips.filter((c) => !only.includes(c.name)).map((c) => ({ ...c, recordedAt: c.recordedAt ?? old.recordedAt }));
    }
    for (const f of existsSync(OUT) ? readdirSync(OUT) : []) {
      if (only.some((n) => f === `${n}.webm` || f.startsWith(`${n}--`))) rmSync(join(OUT, f));
    }
  } else {
    // A full run replaces the day's folder, so no screenshot from an earlier take is left beside the new manifest.
    rmSync(OUT, { recursive: true, force: true });
  }
  mkdirSync(RAW, { recursive: true });
  let server: ChildProcess | null = null;
  if (process.env.FOOTAGE_URL) {
    BASE = process.env.FOOTAGE_URL.replace(/\/$/, "");
  } else {
    const port = await freePort();
    BASE = `http://localhost:${port}`;
    server = spawn("npx", ["next", "dev", "--port", String(port)], {
      env: { ...process.env, STORE: "memory", KIBO_DEV_CACHE: "off" },
      stdio: "ignore",
      detached: true,
    });
  }
  const browser = await chromium.launch();
  const clips: ClipResult[] = [];
  try {
    await waitForServer(BASE);
    if (server) await warm(browser);
    for (const clip of selected) clips.push(await record(browser, clip));
  } finally {
    await browser.close();
    if (server?.pid) process.kill(-server.pid);
    rmSync(RAW, { recursive: true, force: true });
    const manifest = {
      date: DATE,
      recordedAt: new Date().toISOString(),
      baseUrl: process.env.FOOTAGE_URL ? BASE : "local dev server (STORE=memory)",
      // From this machine's env; a FOOTAGE_URL deployment uses its own Cloud Run settings.
      models: { ...MODELS, source: process.env.FOOTAGE_URL ? "assumed, set on the deployment" : "local env" },
      typeDelayMs: TYPE_DELAY_MS,
      holdMs: HOLD_MS,
      // In CLIPS order; a clip kept from an earlier take has its own recordedAt.
      clips: CLIPS.flatMap((c) => [...kept, ...clips].filter((r) => r.name === c.name)),
    };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`${manifestPath}: ${clips.filter((c) => c.ok).length}/${selected.length} clips recorded`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
