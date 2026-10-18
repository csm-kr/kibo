import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";
import { getKiosk } from "@/lib/adapters/catalog";
import { lineLabel } from "@/lib/kiosk/menu";
import type { CartLine } from "@/types/session";
import { evidencePath } from "../scripts/evidencePath";
import { kioskRoot } from "./helpers";

// Voice order end to end on /demo with real Gemini Live (docs/TESTING.md "End to end", "Latency"). Chromium's fake
// mic plays a synthetic TTS sentence (e2e/fixtures, `npm run fixtures:voice`); no real person's voice. The page runs
// with `?e2e=1`, so useLiveVoice keeps latency marks on window.__kiboVoiceTimings (src/lib/voice/e2eMarks.ts).
// Every run, pass or fail, is added to evidence/voice-e2e.json: fixture, pass, timings, model. No transcript, no token.
// Relay mode (ADR-012): the same orders on a second app (scripts/e2e-relay-stack.ts, port 3110) with
// GEMINI_LIVE_BACKEND=vertex, so the phone's voice goes through the kibo-voice relay to Vertex AI Live; its runs go
// to evidence/voice-e2e-relay.json. Only with EVIDENCE=1 (`npm run evidence:live`): otherwise the runs are added to a
// copy in test-results/evidence/, so a QA run never changes the cited numbers (I-099, R-021).

const ABOUT_TAIL =
  "Synthetic TTS voice " +
  "(Gemini TTS, e2e/fixtures) through Chromium's fake microphone on a laptop, not a real phone. End of speech = the last " +
  "voiced 40 ms mic frame sent to Live before the model's first output; the page sends the looping fixture once. (a) end of speech → first AI audio chunk; " +
  "(b) end of speech → first 2 s highlight ring on the kiosk half. Medians over passing runs.";

const MODES = {
  direct: {
    evidence: "voice-e2e.json",
    baseURL: undefined as string | undefined,
    about: "Voice order E2E on /demo with real Gemini Live (e2e/voice.live.spec.ts, `npm run test:e2e:live`). " + ABOUT_TAIL,
  },
  relay: {
    evidence: "voice-e2e-relay.json",
    baseURL: "http://localhost:3110",
    about:
      "Voice order E2E on /demo through the kibo-voice relay to Vertex AI Live (relay mode of e2e/voice.live.spec.ts, " +
      "`npm run test:e2e:live`): GEMINI_LIVE_BACKEND=vertex; the relay and a dev server run in one local process " +
      "(scripts/e2e-relay-stack.ts), so the browser → relay hop is local, not Cloud Run; Vertex AI in VOICE_VERTEX_LOCATION " +
      "or us-central1. " +
      ABOUT_TAIL,
  },
};
type Mode = keyof typeof MODES;
const kiosk = getKiosk("malo");

// Fixture generation the run used. v1 (10-12 to 10-14) had a click at the start and a ~140 ms noise tail that counted
// as speech (I-237), so its end of speech came late; the headline summary uses the current fixtures only.
const FIXTURES = "v2: 24 kHz, header and trailing chunk stripped (I-237)";

interface Run {
  at: string;
  fixture: string;
  fixtures?: string;
  /** False when the mic never reached listening: Live (or the relay) did not connect, an upstream failure. */
  connected?: boolean;
  pass: boolean;
  model: string | null;
  /** End of speech → first AI audio chunk, ms. */
  aMs: number | null;
  /** End of speech → first kiosk highlight, ms. */
  bMs: number | null;
  /** End of speech → first tool call from the model, ms (explains b). */
  toolMs: number | null;
  /** Commands the page sent, as "type:result code", in order (explains a failure). */
  commands: string[];
}

let current: Run | null = null;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Runs that happened but were taken out of the file before 10-14 (I-099), kept as counts. */
interface Omitted {
  when: string;
  runs: number;
  passed: number;
  upstream: number;
  why: string;
}

function record(mode: Mode, run: Run) {
  const { evidence: name, about } = MODES[mode];
  const evidence = evidencePath(name);
  // A scratch copy starts from the committed file, so its summary covers the same runs plus this one.
  const from = existsSync(evidence) ? evidence : join(process.cwd(), "evidence", name);
  const old = existsSync(from)
    ? (JSON.parse(readFileSync(from, "utf8")) as { runs: Run[]; omitted?: Omitted[] })
    : { runs: [], omitted: [] };
  const runs = [...old.runs, { ...run, fixtures: FIXTURES }];
  const omitted = old.omitted ?? [];
  const current = runs.filter((r) => r.fixtures === FIXTURES);
  const passed = current.filter((r) => r.pass);
  const pick = (k: "aMs" | "bMs", rs: Run[]) => rs.flatMap((r) => (r[k] === null ? [] : [r[k]]));
  const fixtures = [...new Set(current.map((r) => r.fixture))];
  const failedUpstream = (r: Run) => !r.pass && r.connected === false;
  const out = {
    about,
    model: passed.find((r) => r.model)?.model ?? runs.find((r) => r.model)?.model ?? null,
    firstRun: runs[0]?.at ?? null,
    lastRun: run.at,
    summary: {
      fixtures: FIXTURES,
      runs: current.length,
      passed: passed.length,
      upstreamFailures: current.filter(failedUpstream).length,
      aMedianMs: median(pick("aMs", passed)),
      bMedianMs: median(pick("bMs", passed)),
      byFixture: Object.fromEntries(
        fixtures.map((f) => {
          const rs = current.filter((r) => r.fixture === f);
          const ok = rs.filter((r) => r.pass);
          return [f, { runs: rs.length, passed: ok.length, aMedianMs: median(pick("aMs", ok)), bMedianMs: median(pick("bMs", ok)) }];
        }),
      ),
    },
    // Every attempt on record, all fixture versions, including the omitted ones (R-001).
    allAttempts: {
      attempted: runs.length + omitted.reduce((n, o) => n + o.runs, 0),
      passed: runs.filter((r) => r.pass).length + omitted.reduce((n, o) => n + o.passed, 0),
      upstreamFailures: runs.filter(failedUpstream).length + omitted.reduce((n, o) => n + o.upstream, 0),
    },
    omitted,
    runs,
  };
  writeFileSync(evidence, JSON.stringify(out, null, 2) + "\n");
}

/** The hero cart: two cheeseburger sets, drinks zero cola and cider, exactly one without pickles. */
function isHero(cart: CartLine[]): boolean {
  if (cart.length !== 2 && !(cart.length === 1 && cart[0].qty === 2)) return false;
  if (!cart.every((l) => l.itemId === "cheese_burger" && l.variant === "set" && l.qty === 1)) return false;
  const drinks = cart.map((l) => l.selections.drink?.[0]).sort();
  const noPickles = cart.filter((l) => l.selections.ingredients?.includes("no_pickles")).length;
  return JSON.stringify(drinks) === JSON.stringify(["cider", "zero_cola"]) && noPickles === 1;
}

async function startDemo(page: Page) {
  await page.goto("/demo?e2e=1");
  await expect(page.getByRole("heading", { name: "Don't learn the kiosk. Just talk." })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Try it on this screen" }).click();
  await expect(page.locator("[data-phone-screen]")).toHaveAttribute("data-phone-screen", "dine");
  // The first 6-8 px ring on the kiosk half, in the page's clock (the same clock as the voice marks).
  await page.evaluate(() => {
    const w = window as unknown as { __kiboHighlightAt?: number };
    new MutationObserver(() => {
      if (w.__kiboHighlightAt === undefined && document.querySelector("[data-kiosk-canvas] .k-ring")) w.__kiboHighlightAt = performance.now();
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  });
}

/** A browser whose fake mic plays this fixture; launch flags cannot change inside one Playwright worker. */
async function openPage(fixture: string, ip: string, baseURL: string | undefined): Promise<{ page: Page; close(): Promise<void> }> {
  const browser = await chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      // The fake device loops the file; useLiveVoice (e2e) waits for a silent frame, so Live hears whole sentences.
      `--use-file-for-fake-audio-capture=${join(process.cwd(), "e2e/fixtures", `${fixture}.wav`)}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
    // Its own address for the dev server's per-IP limit, like e2e/demo.spec.ts.
    extraHTTPHeaders: { "X-Forwarded-For": ip },
  });
  return { page: await context.newPage(), close: () => browser.close() };
}

const RUNS: { mode: Mode; fixture: string; ip: string }[] = [
  { mode: "direct", fixture: "hero-en", ip: "192.0.2.30" },
  { mode: "direct", fixture: "hero-ko", ip: "192.0.2.31" },
  { mode: "relay", fixture: "hero-en", ip: "192.0.2.50" },
  { mode: "relay", fixture: "hero-ko", ip: "192.0.2.51" },
];

for (const { mode, fixture, ip } of RUNS) {
  test.describe(`${mode} ${fixture}`, () => {
    let close: (() => Promise<void>) | null = null;

    test.afterEach(async ({}, info) => {
      await close?.();
      close = null;
      if (!current) return;
      current.pass = info.status === "passed";
      record(mode, current);
      current = null;
    });

    const title =
      mode === "direct"
        ? `@live voice order from a synthetic voice (${fixture}) fills the hero cart on both halves`
        : `@live voice order through the Vertex relay (${fixture}) fills the hero cart on both halves`;
    test(title, async ({}, info) => {
      test.skip(process.env.E2E_LIVE !== "1", "calls real Gemini Live; run `npm run test:e2e:live`");
      const opened = await openPage(fixture, ip, MODES[mode].baseURL ?? info.project.use.baseURL);
      close = opened.close;
      const page = opened.page;
      const run: Run = { at: new Date().toISOString(), fixture, connected: false, pass: false, model: null, aMs: null, bMs: null, toolMs: null, commands: [] };
      current = run;

      let cart: CartLine[] = [];
      // How /api/live-token told the page to start, and whether any instructions reached the browser on either path.
      const modes: string[] = [];
      let leaked = false;
      page.on("websocket", (ws) => {
        ws.on("framereceived", ({ payload }) => {
          const text = typeof payload === "string" ? payload : payload.toString();
          if (text.includes("menu_data")) leaked = true;
          // The relay's first message names the model it opened.
          if (text.startsWith('{"relay"')) run.model ??= (JSON.parse(text) as { relay: { model: string } }).relay.model;
        });
      });
      page.on("response", async (res) => {
        if (res.request().method() !== "POST") return;
        try {
          if (res.url().endsWith("/api/live-token")) {
            const body = await res.text();
            if (body.includes("menu_data")) leaked = true;
            const json = JSON.parse(body) as { mode?: string; model?: string };
            if (json.mode) modes.push(json.mode);
            run.model ??= json.model ?? null;
          }
          if (res.url().endsWith("/api/command")) {
            const json = (await res.json()) as { ok: boolean; cart?: CartLine[]; error?: { code: string } };
            if (json.ok && json.cart) cart = json.cart;
            run.commands.push(`${(JSON.parse(res.request().postData() ?? "{}") as { type?: string }).type}:${json.ok ? "ok" : json.error?.code}`);
          }
        } catch {
          // The page closed before the body arrived.
        }
      });

      await startDemo(page);
      const mic = page.locator("button[data-voice-state]");
      await mic.click();
      await expect(mic).toHaveAttribute("data-voice-state", /listening|thinking|speaking/, { timeout: 20_000 });
      run.connected = true;

      // The page sends the sentence once (e2eMarks); stop the mic once the answer's first audio is in.
      await expect
        .poll(
          async () => (await page.evaluate(() => window.__kiboVoiceTimings?.firstAudio != null)) && isHero(cart),
          { timeout: 60_000, intervals: [100] },
        )
        .toBe(true);
      await expect.poll(() => page.evaluate(() => (window as unknown as { __kiboHighlightAt?: number }).__kiboHighlightAt ?? null)).not.toBeNull();
      // Korean speech on /demo's English screens gets a Korean reply (16-judge-r3-fixes:0): the AI's own words,
      // from its output transcription, shown in the phone's bubble.
      // On failure the message tells an English reply from no reply yet; the text itself is never kept.
      if (fixture === "hero-ko") {
        await expect
          .poll(
            async () => {
              // Without the screen-reader prefix ("KIBO: "), which is always Latin.
              const texts = (await page.locator('[data-bubble="model"]').allInnerTexts()).map((t) => t.replace(/^[^:]*:\s*/, ""));
              return `bubbles=${texts.length} hangul=${texts.some((t) => /[가-힣]/.test(t))} latin=${texts.some((t) => /[A-Za-z]{3}/.test(t))}`;
            },
            { timeout: 20_000 },
          )
          .toMatch(/hangul=true/);
      }
      await mic.click();
      await expect(mic).toHaveAttribute("data-voice-state", "off");
      expect(leaked, "instructions reached the browser").toBe(false);
      expect(modes.length).toBeGreaterThan(0);
      // GEMINI_LIVE_BACKEND=vertex always sends the phone to the relay; direct mode (auto) may also go there while
      // the key cannot serve voice.
      if (mode === "relay") expect(new Set(modes)).toEqual(new Set(["relay"]));

      const t = await page.evaluate(() => ({
        marks: window.__kiboVoiceTimings!,
        highlight: (window as unknown as { __kiboHighlightAt?: number }).__kiboHighlightAt ?? null,
      }));
      const end = t.marks.speechEnd!;
      run.aMs = Math.round(t.marks.firstAudio! - end);
      run.bMs = t.highlight === null ? null : Math.round(t.highlight - end);
      run.toolMs = t.marks.firstTool === null ? null : Math.round(t.marks.firstTool - end);
      expect(run.aMs).toBeGreaterThan(0);
      expect(run.bMs).toBeGreaterThan(0);

      // Both halves show the same two lines, rendered from session state. The phone half's screens follow the spoken
      // language (I-404): the Korean sentence turns /demo's English phone Korean.
      await expect(kioskRoot(page)).toHaveAttribute("data-screen", "menu");
      const phoneLocale = fixture === "hero-ko" ? "ko" : "en";
      await expect(page.locator("[data-phone-screen]")).toHaveAttribute("lang", phoneLocale);
      const phoneCart = page.getByRole("region", { name: phoneLocale === "ko" ? "내 주문" : "Your order" });
      const canvas = page.locator("[data-kiosk-canvas]");
      for (const line of cart) {
        const label = lineLabel(kiosk, line, phoneLocale);
        await expect(phoneCart.getByText(label.detail, { exact: true })).toBeVisible();
      }
      // The kiosk's cart chips show name ×qty over the line price only (#1 1, 10-15); the options stay on the phone,
      // K6 and KIBO's subtitle, so the canvas is checked by its chips.
      await expect(phoneCart.getByText(phoneLocale === "ko" ? "치즈버거 세트" : "Cheeseburger set", { exact: true })).toHaveCount(2);
      await expect(canvas.getByText("치즈버거 세트 ×1", { exact: true })).toHaveCount(2);
    });
  });
}
