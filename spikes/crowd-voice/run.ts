// Crowd test (owner 11-22, before the Singapore finale): what Gemini Live does with the phone's pinned voice config
// when other people talk near the microphone. A synthetic user (the e2e fixtures, voice "Kore") speaks the hero order
// or stays silent on the order review, while bystander clips (synth.ts, other TTS voices) play at a set level below
// the user. The script sends the mix as the phone does: 40 ms frames at 16 kHz in real time, nothing while the AI's
// reply would be playing (half-duplex), tool calls answered through the real command path on a memory store.
// It is a digital mix: no room, no phone microphone, no browser noise suppression. See README.md.
//
// Run from the repo root:
//   npx tsx --env-file=.env spikes/crowd-voice/run.ts --scenario order --lang en --levels off,-15,-10,-5,0 --runs 3
//   npx tsx --env-file=.env spikes/crowd-voice/run.ts --scenario review --lang en --levels -15,-10,-5,0 --runs 3
// Options: --variant base|startlow|proactive (Live settings), --gate (the phone's near-voice gate), --warm (the gate
// already knows the user's level; --warm-ms N: it heard only the first N ms), --ptt (hold-to-talk; --ptt-end: with audioStreamEnd on release), --conc N.
// Scenario ownyes: the user's own yes on the review, at a level below their order's.

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI, StartSensitivity, type FunctionResponse, type LiveServerMessage, type Session as LiveSession } from "@google/genai";
import { getKiosk } from "@/lib/adapters/catalog";
import { liveConfig, liveConnectConfig } from "@/lib/agent/live";
import { HERO_CART } from "@/lib/demo/compare";
import { createSession, runCommand } from "@/lib/session/service";
import { MemoryStore } from "@/lib/store/memory";
import { nearGate } from "./nearGate";
import { downsampleTo16k, int16ToBase64 } from "@/lib/voice/pcm";
import { runToolCalls } from "@/lib/voice/toolRunner";
import { initialTurns, turnEvents, turnsReducer } from "@/lib/voice/turns";
import { readWav } from "../../scripts/wav";

const ROOT = process.cwd();
const DIR = join(ROOT, "spikes/crowd-voice");
const KIOSK = "malo";
const kiosk = getKiosk(KIOSK);
const CLOCK = Date.parse("2026-10-13T05:00:00Z");
const RATE = 16000;
const FRAME = (RATE * 40) / 1000;
const USER_DBFS = -20;
const LEAD_S = 5;
const TAIL_S = 12;
const GAP_S = 0.4;
const MUTE_TAIL_MS = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}
const SCENARIO = arg("scenario", "order") as "order" | "review" | "ownyes";
const LANG = arg("lang", "en") as "en" | "ko";
const LEVELS = arg("levels", "off,-15,-10,-5,0").split(",");
const RUNS = Number(arg("runs", "3"));
const CONC = Number(arg("conc", "4"));
const VARIANT = arg("variant", "base") as "base" | "startlow" | "proactive";
const GATE = process.argv.includes("--gate");
const WARM = process.argv.includes("--warm");
/** Hold-to-talk: the phone sends the microphone only while the user holds a button (0.2 s around their own speech
 *  here) and silence otherwise. Order scenario only. */
const PTT = process.argv.includes("--ptt") || process.argv.includes("--ptt-end");
/** Hold-to-talk that tells Live the audio ended on release (`audioStreamEnd`) and then sends nothing, so the turn
 *  does not wait for 1 s of silence. */
const PTT_END = process.argv.includes("--ptt-end");
/** How much of the user's sentence the warm gate has heard, in ms; the whole sentence when not given. */
const WARM_MS = Number(arg("warm-ms", "0"));

// ---- Audio ----

function load(path: string): Float32Array {
  const { rate, samples } = readWav(readFileSync(path));
  const f = Float32Array.from(samples, (s) => s / 0x8000);
  return Float32Array.from(downsampleTo16k(f, rate), (s) => s / 0x8000);
}

/** RMS over the 20 ms frames within 35 dB of the loudest one: the level of the speech, not of its pauses. */
function speechRms(x: Float32Array): number {
  const n = RATE / 50;
  const e: number[] = [];
  for (let i = 0; i + n <= x.length; i += n) {
    let s = 0;
    for (let j = i; j < i + n; j++) s += x[j] * x[j];
    e.push(s / n);
  }
  const thr = e.reduce((a, v) => Math.max(a, v), 0) * 10 ** (-35 / 10);
  const active = e.filter((v) => v > thr);
  return Math.sqrt(active.reduce((a, v) => a + v, 0) / Math.max(1, active.length));
}

function atLevel(x: Float32Array, dbfs: number): Float32Array {
  const g = 10 ** (dbfs / 20) / speechRms(x);
  return x.map((s) => s * g);
}

/** The fixture without its leading and trailing silence. */
function trim(x: Float32Array): Float32Array {
  const thr = x.reduce((a, v) => Math.max(a, Math.abs(v)), 0) * 10 ** (-35 / 20);
  let a = 0;
  let b = x.length - 1;
  while (a < b && Math.abs(x[a]) < thr) a++;
  while (b > a && Math.abs(x[b]) < thr) b--;
  return x.subarray(Math.max(0, a - RATE / 10), Math.min(x.length, b + RATE / 10));
}

const CROWD = ["chat-en.wav", "order-en.wav", "chat-ko.wav", "order-ko.wav"];
const YES = { en: "yes-en.wav", ko: "yes-ko.wav" };
const USER_YES = { en: "user-yes-en.wav", ko: "user-yes-ko.wav" };

/** The user's hero order at the user's level. */
const USER_SPEECH = atLevel(trim(load(join(ROOT, "e2e/fixtures", LANG === "ko" ? "hero-ko.wav" : "hero-en.wav"))), USER_DBFS);

interface Mix {
  samples: Float32Array;
  /** Where the user's own speech starts and ends, in ms; null on the review, where the user says nothing. */
  userStartMs: number | null;
  userEndMs: number | null;
}

function buildMix(level: string, run: number): Mix {
  const off = level === "off";
  const crowdDb = USER_DBFS + (off ? 0 : Number(level));
  if (SCENARIO === "ownyes") {
    // The user's own yes on the review, at `level` dB relative to how loud they said the order; nobody else talks.
    const yes = atLevel(load(join(DIR, "audio", USER_YES[LANG])), crowdDb);
    const samples = new Float32Array(2 * RATE + yes.length + 8 * RATE);
    samples.set(yes, 2 * RATE);
    return { samples, userStartMs: null, userEndMs: null };
  }
  if (SCENARIO === "review") {
    // 2 s of quiet, the bystander's yes, 8 s of quiet.
    const yes = atLevel(load(join(DIR, "audio", YES[LANG])), crowdDb);
    const samples = new Float32Array(2 * RATE + yes.length + 8 * RATE);
    if (!off) samples.set(yes, 2 * RATE);
    return { samples, userStartMs: null, userEndMs: null };
  }
  const user = USER_SPEECH;
  const samples = new Float32Array(LEAD_S * RATE + user.length + TAIL_S * RATE);
  if (!off) {
    // Bystander clips one after another with short gaps, from a different clip each run, for the whole take.
    let at = 0;
    for (let i = run; at < samples.length; i++) {
      const clip = atLevel(load(join(DIR, "audio", CROWD[i % CROWD.length])), crowdDb);
      samples.set(clip.subarray(0, Math.min(clip.length, samples.length - at)), at);
      at += clip.length + GAP_S * RATE;
    }
  }
  const start = LEAD_S * RATE;
  for (let i = 0; i < user.length; i++) samples[start + i] += user[i];
  return { samples, userStartMs: LEAD_S * 1000, userEndMs: ((start + user.length) / RATE) * 1000 };
}

function frameB64(f: Float32Array): string {
  return int16ToBase64(Int16Array.from(f, (s) => Math.round(Math.max(-1, Math.min(1, s)) * 0x7fff)));
}

// ---- One run ----

interface Event {
  t: number;
  kind: "heard" | "said" | "audio" | "tool" | "cmd" | "turnComplete" | "interrupted";
  text?: string;
}

async function newOrder() {
  const store = new MemoryStore();
  const started = Date.now();
  const now = () => CLOCK + (Date.now() - started);
  const { sessionId, deviceToken } = await createSession(store, { kioskId: KIOSK, demo: true }, now());
  const bearer = deviceToken!;
  const send = (type: string, args: object, extra: object = {}) =>
    runCommand(store, { body: { sessionId, commandId: randomUUID(), type, args, source: "button", ...extra }, bearer }, now());
  await send("setDineOption", { option: "eat_in" });
  let seq = 0;
  if (SCENARIO !== "order") {
    // The order is in and the AI opened the review after the user's first utterance, as on a real voice order.
    seq = 1;
    for (const line of HERO_CART) await send("addToCart", line, { source: "voice", utteranceSeq: seq });
    await send("requestCheckout", {}, { source: "voice", utteranceSeq: seq });
  }
  return { store, now, sessionId, bearer, seq };
}

function variantConfig(base: ReturnType<typeof liveConnectConfig>) {
  if (VARIANT === "startlow") {
    return {
      ...base,
      realtimeInputConfig: {
        automaticActivityDetection: {
          ...base.realtimeInputConfig.automaticActivityDetection,
          startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
        },
      },
    };
  }
  if (VARIANT === "proactive") return { ...base, proactivity: { proactiveAudio: true } };
  return base;
}

async function one(level: string, run: number) {
  const { store, now, sessionId, bearer, seq } = await newOrder();
  const session = (await store.get(sessionId))!;
  const config = liveConfig(kiosk, { cart: session.cart, status: session.status, dineOption: session.dineOption, locale: LANG });
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: "v1alpha" } });
  const mix = buildMix(level, run);
  const liveSessionId = randomUUID();
  const events: Event[] = [];
  let t0 = 0;
  const t = () => Math.round(performance.now() - t0);
  let turns = initialTurns(seq);
  let playEnd = 0;
  let responding = false;
  let pendingTools = Promise.resolve();
  let live: LiveSession | null = null;
  let closed = false;

  const onmessage = (m: LiveServerMessage) => {
    for (const e of turnEvents(m)) turns = turnsReducer(turns, e);
    const sc = m.serverContent;
    if (sc?.inputTranscription?.text) events.push({ t: t(), kind: "heard", text: sc.inputTranscription.text });
    if (sc?.outputTranscription?.text) events.push({ t: t(), kind: "said", text: sc.outputTranscription.text });
    for (const p of sc?.modelTurn?.parts ?? []) {
      const data = p.inlineData?.data;
      if (!data) continue;
      if (!responding) events.push({ t: t(), kind: "audio" });
      responding = true;
      // 24 kHz 16-bit mono: the reply plays back to back, as on the phone.
      const ms = ((Buffer.from(data, "base64").length / 2) / 24000) * 1000;
      playEnd = Math.max(performance.now(), playEnd) + ms;
    }
    const calls = m.toolCall?.functionCalls ?? [];
    if (calls.length > 0) {
      const utteranceSeq = turns.seq;
      for (const c of calls) events.push({ t: t(), kind: "tool", text: `${c.name} ${JSON.stringify(c.args)}` });
      pendingTools = pendingTools.then(async () => {
        const responses = await runToolCalls(calls, {
          liveSessionId,
          utteranceSeq,
          cartVersion: () => session.cartVersion,
          kiosk,
          locale: LANG,
          send: async (cmd) => runCommand(store, { body: { sessionId, ...cmd }, bearer }, now()),
          onAction: (a) => events.push({ t: t(), kind: "cmd", text: `${a.tool}:${a.code}` }),
        });
        if (!closed) live?.sendToolResponse({ functionResponses: responses as FunctionResponse[] });
      });
    }
    if (sc?.interrupted) {
      events.push({ t: t(), kind: "interrupted" });
      responding = false;
    }
    if (sc?.turnComplete) {
      events.push({ t: t(), kind: "turnComplete" });
      responding = false;
    }
  };

  live = await ai.live.connect({
    model: config.model,
    config: variantConfig(liveConnectConfig(config.system, config.tools, config.languageCode)),
    callbacks: { onmessage, onerror: () => {}, onclose: () => (closed = true) },
  });
  // The review's 1.5 s wait after requestCheckout (CONFIRM_WAIT_MS) has passed before anyone speaks.
  await sleep(SCENARIO !== "order" ? 1600 : 200);
  t0 = performance.now();
  let sent = 0;
  let dropped = 0;
  let ended = false;
  const gate = GATE ? nearGate() : null;
  // On the review the phone's gate has already heard the user say the order; --warm: it heard the user answer the
  // greeting before this order (the gate's level is learned), without sending that to Live.
  const warmTo = WARM_MS > 0 ? Math.min(USER_SPEECH.length, (WARM_MS * RATE) / 1000) : USER_SPEECH.length;
  if (gate && (SCENARIO !== "order" || WARM)) for (let i = 0; i + FRAME <= warmTo; i += FRAME) gate.push(USER_SPEECH.subarray(i, i + FRAME));
  for (let i = 0; i + FRAME <= mix.samples.length && !closed; i += FRAME) {
    const due = t0 + (i / RATE) * 1000;
    const wait = due - performance.now();
    if (wait > 0) await sleep(wait);
    // Half-duplex: the phone sends nothing while the AI's voice plays and for 300 ms after.
    if (performance.now() < playEnd + MUTE_TAIL_MS) {
      dropped++;
      continue;
    }
    const atMs = (i / RATE) * 1000;
    const held = !PTT || mix.userStartMs === null || (atMs >= mix.userStartMs - 200 && atMs < mix.userEndMs! + 200);
    if (PTT_END && mix.userEndMs !== null && atMs >= mix.userEndMs + 200) {
      if (!ended) live.sendRealtimeInput({ audioStreamEnd: true });
      ended = true;
      continue;
    }
    const frame = held ? mix.samples.subarray(i, i + FRAME) : new Float32Array(FRAME);
    const out = gate ? gate.push(frame) : [frame];
    for (const f of out) live.sendRealtimeInput({ audio: { data: frameB64(f), mimeType: "audio/pcm;rate=16000" } });
    sent++;
  }
  await sleep(1500);
  await pendingTools;
  closed = true;
  live.close();

  const end = (await store.get(sessionId))!;
  return { level, run, model: config.model, mix, events, sent, dropped, status: end.status, cart: end.cart };
}

// ---- Summary ----

type Result = Awaited<ReturnType<typeof one>>;

function summarize(r: Result) {
  const outputs = r.events.filter((e) => e.kind === "audio" || e.kind === "tool");
  const heard = r.events.filter((e) => e.kind === "heard").map((e) => e.text).join("");
  const cmds = r.events.filter((e) => e.kind === "cmd").map((e) => e.text);
  if (SCENARIO !== "order") {
    return {
      level: r.level,
      run: r.run,
      // The yes confirmed the review: the session left `confirming` for `paying`. On "review" a bystander said it
      // (wrong); on "ownyes" the user did (right).
      confirmedByBystander: r.status !== "confirming",
      status: r.status,
      cmds,
      heard,
    };
  }
  const { userStartMs, userEndMs } = r.mix;
  const before = outputs.filter((e) => e.t < userStartMs!).length;
  const during = outputs.filter((e) => e.t >= userStartMs! && e.t < userEndMs!).length;
  const after = outputs.find((e) => e.t >= userEndMs!);
  const cheese = r.cart.filter((l) => l.itemId === "cheese_burger").reduce((n, l) => n + l.qty, 0);
  const foreign = [...new Set(r.cart.filter((l) => l.itemId !== "cheese_burger").map((l) => l.itemId))];
  const reactionMs = after ? Math.round(after.t - userEndMs!) : null;
  return {
    level: r.level,
    run: r.run,
    ok: before === 0 && during === 0 && reactionMs !== null && reactionMs <= 5000 && cheese === 2 && foreign.length === 0,
    repliesBeforeUser: before,
    repliesDuringUser: during,
    reactionMs,
    cheeseburgers: cheese,
    foreign,
    cmds,
    heard,
  };
}

async function main() {
  const jobs = LEVELS.flatMap((level) => Array.from({ length: RUNS }, (_, run) => ({ level, run })));
  const results: ReturnType<typeof summarize>[] = [];
  const raw: object[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        try {
          const r = await one(job.level, job.run);
          const s = summarize(r);
          results.push(s);
          raw.push({ ...s, model: r.model, sent: r.sent, dropped: r.dropped, events: r.events });
          console.log(JSON.stringify(s));
        } catch (e) {
          console.log(JSON.stringify({ ...job, error: e instanceof Error ? e.message.slice(0, 200) : "error" }));
        }
      }
    }),
  );
  mkdirSync(join(DIR, "logs"), { recursive: true });
  const name = `${SCENARIO}-${LANG}-${VARIANT}${PTT ? (PTT_END ? "-pttend" : "-ptt") : ""}${GATE ? "-gate" : ""}${WARM ? `-warm${WARM_MS || ""}` : ""}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(join(DIR, "logs", name), JSON.stringify(raw, null, 1));
  console.log(`\n${SCENARIO} ${LANG} ${VARIANT}${PTT ? (PTT_END ? " +hold-to-talk, end on release" : " +hold-to-talk") : ""}${GATE ? " +gate" : ""}${WARM ? ` warm${WARM_MS ? ` ${WARM_MS} ms` : ""}` : ""}  (levels in dB below the user)`);
  for (const level of LEVELS) {
    const rows = results.filter((r) => r.level === level);
    if (SCENARIO !== "order") {
      console.log(`  ${level.padStart(4)}: ${SCENARIO === "ownyes" ? "the user's own" : "a bystander's"} yes confirmed ${rows.filter((r) => "confirmedByBystander" in r && r.confirmedByBystander).length} of ${rows.length}`);
    } else {
      const ok = rows.filter((r) => "ok" in r && r.ok).length;
      console.log(`  ${level.padStart(4)}: right ${ok} of ${rows.length}`);
    }
  }
  console.log(`log: spikes/crowd-voice/logs/${name}`);
}

main().catch((e) => {
  console.error("run failed:", e instanceof Error ? e.message : "error");
  process.exit(1);
});
