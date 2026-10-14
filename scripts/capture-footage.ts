import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test";
import { scenariosFor, stepDone, type StepCheck } from "@/lib/demo/scenarios";
import { LANGUAGES, type SpeechLanguage } from "@/lib/i18n/languages";
import type { Session } from "@/types/session";
import { sheetsSettled, startShotsServer } from "./shotsServer";

// Screen footage of the real app for the demo video (`npm run capture:footage`, docs/plan/FOOTAGE.md). Starts the
// local production build with the in-memory store (scripts/shotsServer.ts; `SHOTS_DEV=1` for a dev server), or
// records FOOTAGE_URL (e.g. the deployed app). Typed orders go to real Gemini through /api/chat; nothing is mocked,
// and each clip counts the messages it sent (`aiMessages`). Writes only to videos/footage/<date>/ (git-ignored): one .webm per clip, a PNG
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
  /** Messages this clip sent to the AI (/api/chat), retries included. */
  aiMessages: number;
  /** The second device of a two-device clip, recorded at the same time. */
  pair?: { file: string | null; viewport: { width: number; height: number }; deviceScaleFactor: number; steps: Mark[] };
}

type ContextOptions = BrowserContextOptions & { viewport: { width: number; height: number } };

interface Device {
  page: Page;
  rec: Recorder;
}

interface Clip {
  name: string;
  route: string;
  usesModel: boolean;
  note?: string;
  context: ContextOptions;
  /** A second device (the phone of a two-device clip), its own context and video, opened right after the first. */
  pair?: { suffix: string; context: ContextOptions };
  run(page: Page, rec: Recorder, pair?: Device): Promise<void>;
}

class Recorder {
  readonly steps: Mark[] = [];
  private readonly t0 = Date.now();
  constructor(
    private readonly page: Page,
    private readonly clip: string,
  ) {}

  /** The same moment on both devices of a two-device clip: both screenshots first, then one shared hold. */
  static async both(a: Recorder, b: Recorder, name: string, hold = HOLD_MS) {
    await Promise.all([a.mark(name, 0), b.mark(name, 0)]);
    if (hold) await a.page.waitForTimeout(hold);
  }

  /**
   * A key moment: timestamp, full-resolution screenshot, then a hold so the edit has room. `settle: false` skips the
   * image wait, for a moment that lasts only a few hundred ms (a replayed tap's mark).
   */
  async mark(name: string, hold = HOLD_MS, settle = true) {
    if (settle) await this.settle();
    // After the wait, so the edit's timestamp shows the same frame as the screenshot.
    const atMs = Date.now() - this.t0;
    const shot = `${this.clip}--${String(this.steps.length + 1).padStart(2, "0")}-${name}.png`;
    await this.page.screenshot({ path: join(OUT, shot) });
    this.steps.push({ name, atMs, shot });
    if (hold) await this.page.waitForTimeout(hold);
  }

  private async settle() {
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
    await sheetsSettled(this.page);
  }
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
        await page.getByRole("button", { name: "Kiosk: insert card (demo)" }).click();
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
        await page.getByRole("button", { name: "Kiosk: insert card (demo)" }).click();
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

/** The phone's AI tool call through the API with the claimed device token, as Gemini Live would send it; no model. */
function phoneAi(sessionId: string, deviceToken: string, headers: Record<string, string>) {
  return <T = { cartVersion: number; cart: { lineId: string }[] }>(type: string, args: object, extra: object) =>
    api<T>("/api/command", { sessionId, commandId: randomUUID(), type, args, ...extra }, headers, deviceToken);
}

/** Claims the session behind the kiosk's QR, as a phone that scanned it. */
async function claimFromQr(page: Page, headers: Record<string, string>) {
  const url = new URL((await page.locator("img[data-claim-url]").first().getAttribute("data-claim-url")) ?? "");
  const sessionId = url.searchParams.get("s") ?? "";
  const { deviceToken } = await api<{ deviceToken: string }>(
    "/api/session/claim",
    { sessionId, claimToken: url.hash.replace(/^#t=/, "") },
    headers,
  );
  return { sessionId, deviceToken };
}

const HERO_LINES = [
  { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["zero_cola"], ingredients: ["no_pickles"] } },
  { itemId: "cheese_burger", variant: "set", qty: 1, selections: { drink: ["cider"] } },
];

const LAPTOP = { viewport: { width: 1440, height: 900 }, locale: "en-US" };

/** The kiosk's card payment and receipt question, up to its order number. */
async function payAtKiosk(page: Page) {
  await page.locator('[data-screen="payment"]').waitFor({ timeout: 15_000 });
  await tap(page, page.getByRole("button", { name: "카드", exact: true }));
  await tap(page, page.getByRole("button", { name: "카드 넣기" }));
  await page.locator('[data-screen="done"]').waitFor({ timeout: 30_000 });
  await skipReceipt(page);
  await page.getByRole("heading", { name: "주문 번호" }).waitFor();
}

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One sentence in an AI-only language on /demo: the kiosk stays Korean, the phone's AI answers in that language. */
function languageClip(code: SpeechLanguage, sentence: string): Clip {
  const { native, english } = LANGUAGES[code];
  const clip: Clip = {
    name: `demo-lang-${code}-1920x1080`,
    route: "/demo?k=malo",
    usesModel: true,
    note: `${english} chosen in the phone's language picker, then one typed sentence (eval case l-${code}-order). Typed, not spoken: spoken input in this language is untested.`,
    context: DESKTOP,
    async run(page, rec) {
      await page.goto(`${BASE}/demo?k=malo`);
      const s = await newDemoSession(page, () => page.getByRole("button", { name: "Start", exact: true }).click({ timeout: 120_000 }));
      const watch = watchSession(s.sessionId, xff(clip));
      try {
        await page.locator("[data-phone-screen]").getByRole("button", { name: "Eat here" }).click();
        await watch.until("dine option", (x) => x.dineOption !== null);
        await page.getByRole("button", { name: "Language: English", exact: true }).click();
        await page.getByRole("dialog", { name: "Language" }).getByRole("button", { name: new RegExp(`^${escapeRe(native)}`) }).click();
        await page.getByRole("button", { name: `Language: ${native}`, exact: true }).waitFor();
        await rec.mark("picked");
        await say(page, sentence);
        // The reply is on screen once /api/chat answered; the AI may have asked a question instead of adding.
        await watch.until("cart line", (x) => x.cart.length > 0, 20_000).catch(() => {});
        await rec.mark("reply", 3000);
      } finally {
        watch.close();
      }
    },
  };
  return clip;
}

/** The sentences of the eval cases l-<code>-order (evals/agent-cases.json), which passed on 10-14. */
const LANGUAGE_SENTENCES: [SpeechLanguage, string][] = [
  ["ja", "チーズバーガーのセットを2つ、飲み物はコーラでお願いします。"],
  ["zh", "两份芝士汉堡套餐，饮料都要可乐。"],
  ["es", "Dos menús de hamburguesa con queso, los dos con cola, por favor."],
  ["vi", "Cho tôi hai phần combo burger phô mai, nước uống là cola."],
  ["fr", "Deux menus cheeseburger, avec un cola pour chacun, s'il vous plaît."],
  ["th", "ขอชุดชีสเบอร์เกอร์สองชุด เครื่องดื่มเป็นโคล่าทั้งสองชุดค่ะ"],
  ["id", "Dua paket cheeseburger, minumannya cola semua."],
];

CLIPS.push(
  {
    name: "two-device-1440x900",
    route: "/kiosk?k=malo + /app",
    usesModel: true,
    note: "Two devices recorded at the same time: a laptop on the landscape /kiosk (this file) and a 390x844 phone (the --phone file). The phone types the kiosk's 6-digit code on /app, then one typed hero sentence (real Gemini). The review is opened on the kiosk by touch, so only the phone's tap can confirm; the card goes in at the kiosk.",
    context: LAPTOP,
    pair: { suffix: "phone", context: PHONE },
    async run(kiosk, rec, pair) {
      if (!pair) throw new Error("no phone");
      const { page: phone, rec: phoneRec } = pair;
      await kiosk.goto(`${BASE}/kiosk?k=malo`);
      const code = kiosk.locator("[data-pair-code]").first();
      await code.waitFor({ timeout: 120_000 });
      await kiosk.locator("[data-pairing-panel]").getByText("Waiting for a phone").waitFor();
      await phone.goto(`${BASE}/app`);
      const field = phone.getByLabel("Enter the 6-digit code shown on the kiosk");
      await field.waitFor({ timeout: 60_000 });
      await Recorder.both(rec, phoneRec, "waiting");
      await field.click();
      await field.pressSequentially((await code.getAttribute("data-pair-code")) ?? "", { delay: 250 });
      await Recorder.both(rec, phoneRec, "code-typed", 800);
      await phone.getByRole("button", { name: "Connect" }).click();
      await phone.waitForURL(/\/assistant\?s=/, { timeout: 20_000 });
      const sessionId = new URL(phone.url()).searchParams.get("s") ?? "";
      const watch = watchSession(sessionId, xff(this));
      try {
        await kiosk.locator("[data-pairing-panel]").getByText(/^Phone connected at/).waitFor();
        await phone.getByRole("button", { name: "Start" }).click({ timeout: 60_000 });
        await phone.getByRole("button", { name: "Type instead" }).click();
        await Recorder.both(rec, phoneRec, "connected");
        await phone.getByRole("button", { name: "Eat here" }).click();
        await watch.until("dine option", (x) => x.dineOption !== null);
        await kiosk.locator('[data-screen="menu"]').waitFor();
        await say(phone, HERO);
        await watch.until("two cheeseburger sets", heroLines);
        await kiosk.locator("[data-kiosk-subtitle]").waitFor();
        await Recorder.both(rec, phoneRec, "hero-lines", 2500);
        // The user finishes on the kiosk by touch; the phone shows the same review and waits for the user's tap.
        await tap(kiosk, kiosk.getByRole("button", { name: "주문하기", exact: true }));
        await watch.until("review", status("confirming"), 15_000);
        await phone.getByRole("button", { name: "Yes, pay now" }).waitFor();
        await Recorder.both(rec, phoneRec, "review");
        await phone.getByRole("button", { name: "Yes, pay now" }).click();
        await watch.until("paying", status("paying"), 15_000);
        await phone.getByRole("heading", { name: "Insert your card into the kiosk" }).waitFor();
        await Recorder.both(rec, phoneRec, "paying");
        await payAtKiosk(kiosk);
        await phone.getByRole("heading", { name: "Order number" }).waitFor({ timeout: 30_000 });
        await Recorder.both(rec, phoneRec, "order-number", 3000);
      } finally {
        watch.close();
      }
    },
  },
  {
    name: "kiosk-laptop-1440x900",
    route: "/kiosk?k=malo",
    usesModel: false,
    note: "A laptop standing in for the kiosk: the tall kiosk with its one QR and code, KIBO's status column beside it (no second QR). The phone is API calls with the claimed device token: source voice for the AI's changes, button for the user's confirm tap; no model.",
    context: LAPTOP,
    async run(page, rec) {
      await page.goto(`${BASE}/kiosk?k=malo`);
      await page.locator("[data-pair-code]").first().waitFor({ timeout: 120_000 });
      await page.getByRole("button", { name: /화면을 눌러서 주문/ }).and(page.locator(":enabled")).waitFor();
      const qrs = await page.locator("img[data-claim-url]").count();
      if (qrs !== 1) throw new Error(`the laptop kiosk shows ${qrs} QR codes, not one`);
      await rec.mark("one-qr", 2500);
      const headers = xff(this);
      const { sessionId, deviceToken } = await claimFromQr(page, headers);
      const ai = phoneAi(sessionId, deviceToken, headers);
      await page.locator("[data-pairing-panel]").getByText(/^Phone connected at/).waitFor();
      await rec.mark("phone-connected");
      await ai("setDineOption", { option: "eat_in" }, { source: "voice", utteranceSeq: 1 });
      await page.locator('[data-screen="menu"]').waitFor();
      await ai("addToCart", HERO_LINES[0], { source: "voice", utteranceSeq: 2 });
      await ai("addToCart", HERO_LINES[1], { source: "voice", utteranceSeq: 2 });
      await page.locator("[data-kiosk-subtitle]").waitFor();
      await rec.mark("ai-added", 2500);
      const review = await ai("requestCheckout", {}, { source: "voice", utteranceSeq: 3 });
      await page.locator('[data-screen="review"]').waitFor();
      await page.locator("[data-pairing-panel]").getByText("Waiting for you to confirm").waitFor();
      await rec.mark("review");
      await ai("confirmCheckout", {}, { source: "button", cartVersion: review.cartVersion });
      await page.locator("[data-kiosk-step]").first().waitFor();
      await rec.mark("payment-step");
      await payAtKiosk(page);
      await rec.mark("order-number", 3000);
    },
  },
  {
    name: "kiosk-subtitles-1080x1920",
    route: "/kiosk?k=malo",
    usesModel: false,
    note: "The Korean kiosk with KIBO's English subtitle row (6 s) under each AI change: the hero lines added, then both fries made large. API calls with the claimed device token, source voice; no model.",
    context: KIOSK,
    async run(page, rec) {
      await page.goto(`${BASE}/kiosk?k=malo`);
      await page.locator("img[data-claim-url]").waitFor({ timeout: 120_000 });
      await page.getByRole("button", { name: /화면을 눌러서 주문/ }).and(page.locator(":enabled")).waitFor();
      const headers = xff(this);
      const { sessionId, deviceToken } = await claimFromQr(page, headers);
      const ai = phoneAi(sessionId, deviceToken, headers);
      await ai("setDineOption", { option: "eat_in" }, { source: "voice", utteranceSeq: 1 });
      await page.locator('[data-screen="menu"]').waitFor();
      await rec.mark("menu", 800);
      await ai("addToCart", HERO_LINES[0], { source: "voice", utteranceSeq: 2 });
      const added = await ai("addToCart", HERO_LINES[1], { source: "voice", utteranceSeq: 2 });
      await page.locator("[data-kiosk-subtitle]").filter({ hasText: "AI added" }).waitFor();
      await rec.mark("subtitle-added", 4000);
      for (const line of added.cart) {
        await ai("updateCart", { lineId: line.lineId, changes: { selections: { side: ["fries_l"] } } }, { source: "voice", utteranceSeq: 3 });
      }
      await page.locator("[data-kiosk-subtitle]").filter({ hasText: "AI changed" }).waitFor();
      await rec.mark("subtitle-changed", 4000);
    },
  },
  {
    name: "learned-replay-1440x900",
    route: "/learned/doughhouse",
    usesModel: false,
    note: "The learned pizza kiosk (our development kiosk) beside KIBO's panel: a phone claims the QR, its AI's commands (API calls, source voice; no model) are replayed by the bridge with a numbered mark on each tap, then the line says the kiosk's own total matches.",
    context: LAPTOP,
    async run(page, rec) {
      await page.goto(`${BASE}/learned/doughhouse`);
      await page.locator("img[data-claim-url]").waitFor({ timeout: 120_000 });
      await rec.mark("waiting", 2500);
      const headers = xff(this);
      const { sessionId, deviceToken } = await claimFromQr(page, headers);
      const widget = page.locator("[data-learned-widget]");
      let seq = 0;
      const replayed = async (type: string, args: object, tapShot?: string) => {
        const commandId = randomUUID();
        await api("/api/command", { sessionId, commandId, type, args, source: "voice", utteranceSeq: ++seq }, headers, deviceToken);
        if (tapShot) {
          // A mark shows about 350 ms before its click, so this still skips the image wait.
          await page.locator('[data-tap-mark="3"]').waitFor({ timeout: 15_000 });
          await rec.mark(tapShot, 0, false);
        }
        await page.locator(`[data-learned-widget][data-replay-command="${commandId}"]`).waitFor({ timeout: 20_000 });
        await widget.locator('[data-replay-caption="ok"]').waitFor({ timeout: 10_000 });
      };
      await replayed("setDineOption", { option: "eat_in" });
      await rec.mark("dine-replayed");
      await replayed("addToCart", { itemId: "pepperoni", qty: 1, selections: { size: ["large"], dough: ["thin"], toppings: ["bacon"] } }, "tapping");
      await rec.mark("matches", 3000);
    },
  },
  {
    name: "learn-replay-themepark-1440x900",
    route: "/learn/themepark",
    usesModel: false,
    note: "The recorded learning run of the fresh hold-out theme park kiosk (bk6), replayed at 16x on /learn; a recorded trace, no AI.",
    context: LAPTOP,
    async run(page, rec) {
      await page.goto(`${BASE}/learn/themepark`);
      await page.locator("[data-learn-play]").waitFor({ timeout: 60_000 });
      await rec.mark("start");
      await page.getByRole("group", { name: "Speed" }).getByRole("button", { name: "16×" }).click();
      await page.locator("[data-learn-play]").click();
      await page.waitForTimeout(2500);
      await rec.mark("playing", 0);
      await page.locator("[data-learn-skill]").waitFor({ timeout: 120_000 });
      await rec.mark("finished");
      // From its top, so its result cards are whole (scrollIntoViewIfNeeded left them cut at the screen edge).
      await page.locator("[data-learn-skill]").evaluate((el) => el.scrollIntoView({ block: "start" }));
      await rec.mark("skill", 3000);
    },
  },
  ...LANGUAGE_SENTENCES.map(([code, sentence]) => languageClip(code, sentence)),
);

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
    aiMessages: 0,
  };
  const open = async (opts: ContextOptions): Promise<BrowserContext> => {
    // The video is recorded at the CSS viewport size: a larger size with a 2x device scale only pads a 1x picture into
    // the top-left corner. The screenshots keep the device scale.
    const ctx = await browser.newContext({ ...opts, extraHTTPHeaders: xff(clip), recordVideo: { dir: RAW, size: opts.viewport } });
    ctx.on("request", (r) => {
      if (r.method() === "POST" && r.url().endsWith("/api/chat")) result.aiMessages++;
    });
    return ctx;
  };
  /** Keeps a video when the clip passed, else deletes it. */
  const keep = async (page: Page, file: string, ok: boolean) => {
    const raw = await page.video()?.path();
    if (!raw) return null;
    if (!ok) {
      rmSync(raw, { force: true });
      return null;
    }
    renameSync(raw, join(OUT, file));
    return file;
  };
  // One retry, for a model call that fails or times out.
  for (let attempt = 1; attempt <= 2 && !result.ok; attempt++) {
    result.attempts = attempt;
    const ctx = await open(clip.context);
    const pairCtx = clip.pair ? await open(clip.pair.context) : null;
    // Opened back to back, so the two videos start within a few milliseconds of each other.
    const page = await ctx.newPage();
    const pairPage = pairCtx ? await pairCtx.newPage() : null;
    const rec = new Recorder(page, clip.name);
    const pairRec = pairPage && clip.pair ? new Recorder(pairPage, `${clip.name}--${clip.pair.suffix}`) : null;
    const started = Date.now();
    try {
      await clip.run(page, rec, pairPage && pairRec ? { page: pairPage, rec: pairRec } : undefined);
      result.ok = true;
    } catch (e) {
      result.errors.push(`attempt ${attempt}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
    result.durationMs = Date.now() - started;
    result.steps = rec.steps;
    await ctx.close();
    await pairCtx?.close();
    result.file = await keep(page, `${clip.name}.webm`, result.ok);
    result.bytes = result.file ? statSync(join(OUT, result.file)).size : 0;
    if (pairPage && pairRec && clip.pair) {
      const file = await keep(pairPage, `${clip.name}--${clip.pair.suffix}.webm`, result.ok);
      result.pair = { file, viewport: clip.pair.context.viewport, deviceScaleFactor: clip.pair.context.deviceScaleFactor ?? 1, steps: pairRec.steps };
    }
    console.log(`${clip.name}: ${result.ok ? "ok" : "failed"} (attempt ${attempt}, ${Math.round(result.durationMs / 1000)} s, ${result.aiMessages} AI messages so far)`);
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
  const server = process.env.FOOTAGE_URL ? null : await startShotsServer();
  BASE = server ? server.base : (process.env.FOOTAGE_URL ?? "").replace(/\/$/, "");
  const browser = await chromium.launch();
  const clips: ClipResult[] = [];
  try {
    if (server?.mode === "dev") await warm(browser);
    for (const clip of selected) clips.push(await record(browser, clip));
  } finally {
    await browser.close();
    server?.stop();
    rmSync(RAW, { recursive: true, force: true });
    const manifest = {
      date: DATE,
      recordedAt: new Date().toISOString(),
      baseUrl: server ? `local ${server.mode} server (STORE=memory)` : BASE,
      // From this machine's env; a FOOTAGE_URL deployment uses its own Cloud Run settings.
      models: { ...MODELS, source: process.env.FOOTAGE_URL ? "assumed, set on the deployment" : "local env" },
      typeDelayMs: TYPE_DELAY_MS,
      holdMs: HOLD_MS,
      // In CLIPS order; a clip kept from an earlier take has its own recordedAt.
      clips: CLIPS.flatMap((c) => [...kept, ...clips].filter((r) => r.name === c.name)),
    };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const sent = clips.reduce((n, c) => n + c.aiMessages, 0);
    console.log(`${manifestPath}: ${clips.filter((c) => c.ok).length}/${selected.length} clips recorded, ${sent} AI messages sent`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
