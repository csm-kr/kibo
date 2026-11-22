// The first press (I-439): what Live does with speech that was held back while the phone connected, and with a hold
// that starts around the phone's greeting.
//
//   burst    the whole first sentence was said before the connection opened: no greeting is sent, the sentence goes
//            up at once (faster than real time), then `audioStreamEnd`.
//   partial  the first --head-ms of the sentence go up at once, the rest in real time, then `audioStreamEnd`.
//   greet    the greeting is sent as the connection opens, and the hold starts --offset-ms later (in real time).
//   paced    control: no greeting, the sentence in real time.
//
// Run from the repo root:
//   npx tsx --env-file=.env spikes/crowd-voice/first-press.ts --mode burst --runs 5 --lang ko
//   npx tsx --env-file=.env spikes/crowd-voice/first-press.ts --mode greet --offset-ms 0 --runs 5
//   ... --vertex   (Vertex AI Live, as the kibo-voice relay uses)
//   ... --speed 4  (the held-back part goes up 4 times faster than real time instead of all at once)

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI, type FunctionResponse, type LiveServerMessage, type Session as LiveSession } from "@google/genai";
import { getKiosk } from "@/lib/adapters/catalog";
import { liveConfig, liveConnectConfig } from "@/lib/agent/live";
import { sameOrder } from "@/lib/demo/compare";
import { createSession, runCommand } from "@/lib/session/service";
import { MemoryStore } from "@/lib/store/memory";
import { downsampleTo16k, int16ToBase64 } from "@/lib/voice/pcm";
import { GREETING_NOTE } from "@/lib/voice/greeting";
import { runToolCalls } from "@/lib/voice/toolRunner";
import { initialTurns, turnEvents, turnsReducer } from "@/lib/voice/turns";
import { readWav } from "../../scripts/wav";

const ROOT = process.cwd();
const kiosk = getKiosk("malo");
const CLOCK = Date.parse("2026-10-13T05:00:00Z");
const RATE = 16000;
const FRAME = 640;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}
const MODE = arg("mode", "burst") as "burst" | "partial" | "greet" | "paced";
const RUNS = Number(arg("runs", "3"));
const LANG = arg("lang", "ko") as "ko" | "en";
const HEAD_MS = Number(arg("head-ms", "2000"));
const OFFSET_MS = Number(arg("offset-ms", "0"));
const VERTEX = process.argv.includes("--vertex");
// The held-back part goes up this many times faster than real time (0: all at once).
const SPEED = Number(arg("speed", "0"));
const GREETING =
  LANG === "ko"
    ? "안녕하세요! 무엇을 드릴까요? 말씀만 하세요. 마이크 버튼을 누른 채로 말씀해 주세요."
    : "Hi! What would you like? Just say it. Hold the mic button while you talk.";

function load(path: string): Float32Array {
  const { rate, samples } = readWav(readFileSync(path));
  return Float32Array.from(downsampleTo16k(Float32Array.from(samples, (s) => s / 0x8000), rate), (s) => s / 0x8000);
}
function trim(x: Float32Array): Float32Array {
  const thr = x.reduce((a, v) => Math.max(a, Math.abs(v)), 0) * 10 ** (-35 / 20);
  let a = 0;
  let b = x.length - 1;
  while (a < b && Math.abs(x[a]) < thr) a++;
  while (b > a && Math.abs(x[b]) < thr) b--;
  return x.subarray(a, b + 1);
}
const b64 = (f: Float32Array) => int16ToBase64(Int16Array.from(f, (s) => Math.round(Math.max(-1, Math.min(1, s)) * 0x7fff)));

async function one(run: number) {
  const store = new MemoryStore();
  const started = Date.now();
  const now = () => CLOCK + (Date.now() - started);
  const { sessionId, deviceToken } = await createSession(store, { kioskId: "malo", demo: true }, now());
  const bearer = deviceToken!;
  await runCommand(store, { body: { sessionId, commandId: randomUUID(), type: "setDineOption", args: { option: "eat_in" }, source: "button" }, bearer }, now());
  const session = (await store.get(sessionId))!;
  const config = liveConfig(kiosk, { cart: session.cart, status: session.status, dineOption: session.dineOption, locale: LANG });
  const ai = VERTEX
    ? new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT || "kibo-2026", location: process.env.VOICE_VERTEX_LOCATION || "us-central1" })
    : new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: "v1alpha" } });
  const liveSessionId = randomUUID();
  let turns = initialTurns();
  let pendingTools = Promise.resolve();
  let busyTools = 0;
  let live: LiveSession | null = null;
  let closed = false;
  let t0 = 0;
  let heard = "";
  let said = "";
  let lastOutput = 0;
  let playEnd = 0;
  let turnCompleteAt = 0;
  const cmds: string[] = [];
  // The order of what the server sent, with the time since the connection opened.
  const trace: string[] = [];
  const note = (what: string) => {
    if (trace.at(-1)?.startsWith(`${what}@`)) return;
    trace.push(`${what}@${Math.round(performance.now() - t0)}`);
  };

  const onmessage = (m: LiveServerMessage) => {
    for (const e of turnEvents(m)) turns = turnsReducer(turns, e);
    const sc = m.serverContent;
    if (sc?.inputTranscription?.text) {
      heard += sc.inputTranscription.text;
      note("heard");
    }
    if (sc?.outputTranscription?.text) said += sc.outputTranscription.text;
    for (const p of sc?.modelTurn?.parts ?? []) {
      const data = p.inlineData?.data;
      if (!data) continue;
      note("audio");
      lastOutput = performance.now();
      playEnd = Math.max(performance.now(), playEnd) + ((Buffer.from(data, "base64").length / 2) / 24000) * 1000;
    }
    if (sc?.interrupted) {
      note("INTERRUPTED");
      playEnd = performance.now();
    }
    if (sc?.turnComplete) {
      note("turnComplete");
      turnCompleteAt = performance.now();
    }
    const calls = m.toolCall?.functionCalls ?? [];
    if (calls.length > 0) {
      note(`tool:${calls.map((c) => c.name).join("+")}`);
      lastOutput = performance.now();
      const utteranceSeq = turns.seq;
      busyTools++;
      pendingTools = pendingTools.then(async () => {
        const fresh = (await store.get(sessionId))!;
        const responses = await runToolCalls(calls, {
          liveSessionId,
          utteranceSeq,
          cartVersion: () => fresh.cartVersion,
          kiosk,
          locale: LANG,
          send: async (cmd) => runCommand(store, { body: { sessionId, ...cmd }, bearer }, now()),
          onAction: (a) => cmds.push(`${a.tool}:${a.code}`),
        });
        busyTools--;
        if (!closed) live?.sendToolResponse({ functionResponses: responses as FunctionResponse[] });
      });
    }
  };

  live = await ai.live.connect({
    model: config.model,
    config: liveConnectConfig(config.system, config.tools, config.languageCode),
    callbacks: { onmessage, onerror: () => {}, onclose: () => (closed = true) },
  });
  t0 = performance.now();
  const user = trim(load(join(ROOT, "e2e/fixtures", `hero-${LANG}.wav`)));
  const pad = 0.2 * RATE;
  const total = pad + user.length + pad;
  const frameAt = (i: number) => {
    const frame = new Float32Array(FRAME);
    for (let j = 0; j < FRAME; j++) {
      const u = i + j - pad;
      frame[j] = u >= 0 && u < user.length ? user[u] : 0;
    }
    return { audio: { data: b64(frame), mimeType: "audio/pcm;rate=16000" } };
  };

  if (MODE === "greet") {
    live.sendClientContent({ turns: [{ role: "user", parts: [{ text: `${GREETING_NOTE} ${GREETING}` }] }], turnComplete: true });
    note("greeting-sent");
    if (OFFSET_MS > 0) await sleep(OFFSET_MS);
  }
  note("hold-start");
  // How much of the sentence goes up at once: all of it, its head, or nothing.
  const atOnce = MODE === "burst" ? total : MODE === "partial" ? (HEAD_MS * RATE) / 1000 : 0;
  let i = 0;
  for (; i + FRAME <= total && i < atOnce; i += FRAME) {
    live.sendRealtimeInput(frameAt(i));
    if (SPEED > 0) await sleep(((FRAME / RATE) * 1000) / SPEED);
  }
  const startAt = performance.now() - (i / RATE) * 1000;
  for (; i + FRAME <= total; i += FRAME) {
    const wait = startAt + (i / RATE) * 1000 - performance.now();
    if (wait > 0) await sleep(wait);
    live.sendRealtimeInput(frameAt(i));
  }
  const released = performance.now();
  live.sendRealtimeInput({ audioStreamEnd: true });
  note("released");

  let reaction: number | null = null;
  while (performance.now() - released < 25_000 && !closed) {
    await sleep(40);
    if (reaction === null && lastOutput > released) reaction = Math.round(lastOutput - released);
    const quiet = performance.now() - Math.max(lastOutput, playEnd) > 1500;
    if (reaction !== null && turnCompleteAt > released && busyTools === 0 && quiet) break;
    if (reaction === null && performance.now() - released > 10_000) break;
  }
  await pendingTools;
  closed = true;
  live.close();
  const end = (await store.get(sessionId))!;
  return { run, reaction, heroCart: sameOrder(end.cart), lines: end.cart.length, cmds, heard: heard.trim(), said: said.trim().slice(0, 160), trace };
}

async function main() {
  console.log(JSON.stringify({ mode: MODE, lang: LANG, vertex: VERTEX, headMs: HEAD_MS, offsetMs: OFFSET_MS, speed: SPEED, runs: RUNS }));
  for (let run = 0; run < RUNS; run++) {
    try {
      const r = await one(run);
      console.log(JSON.stringify(r));
    } catch (e) {
      console.log(JSON.stringify({ run, error: e instanceof Error ? e.message.slice(0, 200) : "error" }));
    }
  }
}
void main().then(() => process.exit(0));
