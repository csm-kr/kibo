// Finale rehearsal (docs/GOAL.md): orders by voice on a deployed KIBO as a person would with two devices, and counts
// first-try orders. A laptop browser opens /kiosk, a phone-sized touch browser opens the QR's claim link, taps
// [Turn on the microphone] and holds the mic with a touch at one of four moments:
//   connecting  the microphone is open, the connection is not (what is said waits for it, I-439)
//   thinking    connected, the greeting not heard yet
//   greeting    1.2 s into the greeting
//   ready       after the greeting
// The phone's fake microphone says the hero order once per hold (`?e2e=1`, src/lib/voice/e2eMarks.ts). A run is a
// first-try order when the kiosk screen shows both set lines within 45 s of the release. Real Gemini Live, synthetic
// voice, Chromium: not a phone in a room; the owner's phone test is the judge for that.
//
//   npm run rehearse -- --url https://hold---kibo-407514467119.asia-northeast3.run.app --runs 3
//   ... --cases connecting,ready --langs ko,en --out spikes/crowd-voice/logs/rehearse.json
// One session and one voice start per run. The server allows 10 new sessions a minute and 24 voice starts a day per
// address and instance, and a phone on the same Wi-Fi shares them: keep a rehearsal small on the day of a demo.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}
const URL_BASE = arg("url", "http://localhost:3000").replace(/\/$/, "");
const CASES = arg("cases", "connecting,thinking,greeting,ready").split(",");
const LANGS = arg("langs", "ko,en").split(",");
const RUNS = Number(arg("runs", "3"));
const OUT = arg("out", "");

const micState = (p: Page) => p.evaluate(() => document.querySelector("button[data-voice-state]")?.getAttribute("data-voice-state") ?? "none");

interface Result {
  case: string;
  lang: string;
  run: number;
  ok: boolean;
  pressedIn: string;
  /** Tap on [Turn on the microphone] to the first moment a hold counts. */
  tapToTalkMs: number | null;
  releaseToKioskMs: number | null;
  commands: string[];
  timeline: string[];
  error?: string;
}

async function one(c: string, lang: string, run: number): Promise<Result> {
  const out: Result = { case: c, lang, run, ok: false, pressedIn: "", tapToTalkMs: null, releaseToKioskMs: null, commands: [], timeline: [] };
  const kb = await chromium.launch();
  const pb = await chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${join(process.cwd(), "e2e/fixtures", `hero-${lang}.wav`)}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  try {
    const kiosk = await (await kb.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await kiosk.goto(`${URL_BASE}/kiosk?k=malo`);
    const qr = kiosk.locator("img[data-claim-url]");
    await qr.waitFor({ timeout: 60_000 });
    const claim = (await qr.getAttribute("data-claim-url")) ?? "";
    const sid = new URL(claim).searchParams.get("s");
    const ctx = await pb.newContext({ viewport: { width: 390, height: 844 }, locale: "en-US", isMobile: true, hasTouch: true, permissions: ["microphone"] });
    const phone = await ctx.newPage();
    let t0 = 0;
    const mark = (n: string) => out.timeline.push(`${n}@${Date.now() - t0}`);
    phone.on("response", async (res) => {
      if (res.request().method() !== "POST" || !res.url().endsWith("/api/command")) return;
      try {
        const j = (await res.json()) as { ok: boolean; error?: { code: string } };
        out.commands.push(`${(JSON.parse(res.request().postData() ?? "{}") as { type?: string }).type}:${j.ok ? "ok" : j.error?.code}`);
      } catch {
        // The page closed before the body arrived.
      }
    });
    await phone.exposeFunction("__mark", (s: string) => {
      mark(s);
      if (out.tapToTalkMs === null && s !== "starting") out.tapToTalkMs = Date.now() - t0;
    });
    // A string, not a function: tsx adds a name helper to functions that the page does not have.
    await phone.addInitScript(`(() => {
      let last = "";
      const tick = () => {
        const s = document.querySelector("button[data-voice-state]")?.getAttribute("data-voice-state") ?? "";
        if (s && s !== last) {
          last = s;
          window.__mark?.(s);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })()`);
    // The phone's camera opens the claim link; the reload only adds `?e2e=1` (the device token is stored).
    await phone.goto(claim);
    await phone.getByRole("button", { name: "Turn on the microphone" }).waitFor({ timeout: 60_000 });
    await phone.goto(`${URL_BASE}/assistant?s=${sid}&e2e=1`);
    const on = phone.getByRole("button", { name: "Turn on the microphone" });
    await on.waitFor({ timeout: 60_000 });
    t0 = Date.now();
    await on.click();
    // The press may land while the dine option is still on its way to the server: the cart screen then opens under
    // the finger, as it does for a person who taps [Eat here] and talks at once (I-441).
    await phone.getByRole("button", { name: "Eat here" }).click({ timeout: 30_000 });
    const mic = phone.locator("button[data-voice-state]");
    await mic.waitFor({ timeout: 20_000 });
    const until = async (want: string[], ms: number) => {
      const t = Date.now();
      while (Date.now() - t < ms) {
        if (want.includes(await micState(phone))) return;
        await phone.waitForTimeout(30);
      }
    };
    if (c === "connecting") await until(["connecting"], 5000);
    if (c === "thinking") await until(["thinking"], 30_000);
    if (c === "greeting") {
      await until(["speaking"], 30_000);
      await phone.waitForTimeout(1200);
    }
    if (c === "ready") await until(["ready"], 45_000);
    out.pressedIn = await micState(phone);
    const box = (await mic.boundingBox())!;
    const cdp = await ctx.newCDPSession(phone);
    mark("FINGER-DOWN");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }] });
    // Held until the sentence was said and 0.7 s of quiet followed (a person lets go then), or 20 s.
    await phone
      .waitForFunction(
        () => {
          const m = (window as unknown as { __kiboVoiceTimings?: { lastVoiced: number | null } }).__kiboVoiceTimings;
          return m?.lastVoiced != null && performance.now() - m.lastVoiced > 700;
        },
        null,
        { timeout: 20_000, polling: 50 },
      )
      .catch(() => {});
    mark("FINGER-UP");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const released = Date.now();
    const lines = kiosk.locator("[data-kiosk-canvas]").getByText("치즈버거 세트 ×1", { exact: true });
    while (Date.now() - released < 45_000 && (await lines.count()) < 2) await kiosk.waitForTimeout(100);
    out.ok = (await lines.count()) === 2;
    if (out.ok) out.releaseToKioskMs = Date.now() - released;
  } catch (e) {
    out.error = String(e).slice(0, 200);
  } finally {
    await pb.close();
    await kb.close();
  }
  return out;
}

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);

async function main() {
  const results: Result[] = [];
  for (let run = 0; run < RUNS; run++) {
    for (const lang of LANGS) {
      for (const c of CASES) {
        const r = await one(c, lang, run);
        results.push(r);
        console.log(`${r.ok ? "ok  " : "FAIL"} ${c.padEnd(10)} ${lang} run ${run + 1}: pressed in "${r.pressedIn}", release to kiosk ${r.releaseToKioskMs ?? "-"} ms${r.error ? `, ${r.error}` : ""}`);
        if (!r.ok) console.log(`     commands: ${r.commands.join(", ") || "none"}\n     timeline: ${r.timeline.join("  ")}`);
      }
    }
  }
  console.log(`\nfirst-try orders on ${URL_BASE}`);
  for (const c of CASES) {
    const rows = results.filter((r) => r.case === c);
    console.log(`  ${c.padEnd(10)} ${rows.filter((r) => r.ok).length} of ${rows.length}`);
  }
  const ok = results.filter((r) => r.ok);
  const talk = results.map((r) => r.tapToTalkMs).filter((x): x is number => x !== null);
  console.log(`  all        ${ok.length} of ${results.length}`);
  console.log(`  tap to the first moment a hold counts: median ${median(talk)} ms (${Math.min(...talk)} to ${Math.max(...talk)})`);
  console.log(`  release to both lines on the kiosk: median ${median(ok.map((r) => r.releaseToKioskMs ?? 0))} ms`);
  if (OUT) writeFileSync(OUT, JSON.stringify({ url: URL_BASE, date: new Date().toISOString(), results }, null, 1));
  process.exit(ok.length === results.length ? 0 : 1);
}

void main();
