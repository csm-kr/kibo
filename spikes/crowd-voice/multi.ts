// Several holds in one Live session (hold-to-talk): the hero order as five separate holds (order, large fries,
// no dessert, pay, yes), with bystanders talking the whole time and reaching Live only while the button is held.
// After each release the phone either tells Live the audio ended (`audioStreamEnd`) and sends nothing, or sends
// 1.2 s of silence and then nothing. The question: does every later hold still get heard and answered?
//
// Run from the repo root:
//   npx tsx --env-file=.env spikes/crowd-voice/multi.ts --release end --levels off,-10,0 --runs 3
//   npx tsx --env-file=.env spikes/crowd-voice/multi.ts --release zeros --levels off,-10,0 --runs 3
//   ... --vertex   (Vertex AI Live, as the kibo-voice relay uses; needs gcloud application-default credentials)
//   ... --gap-ms 90000   (after the second hold nothing at all is sent for this long, as while a user reads the menu)

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI, type FunctionResponse, type LiveServerMessage, type Session as LiveSession } from "@google/genai";
import { getKiosk } from "@/lib/adapters/catalog";
import { liveConfig, liveConnectConfig } from "@/lib/agent/live";
import { sameOrder } from "@/lib/demo/compare";
import { createSession, runCommand } from "@/lib/session/service";
import { MemoryStore } from "@/lib/store/memory";
import { downsampleTo16k, int16ToBase64 } from "@/lib/voice/pcm";
import { runToolCalls } from "@/lib/voice/toolRunner";
import { initialTurns, turnEvents, turnsReducer } from "@/lib/voice/turns";
import { readWav } from "../../scripts/wav";

const ROOT = process.cwd();
const DIR = join(ROOT, "spikes/crowd-voice");
const kiosk = getKiosk("malo");
const CLOCK = Date.parse("2026-10-13T05:00:00Z");
const RATE = 16000;
const FRAME = 640;
const USER_DBFS = -20;
const MUTE_TAIL_MS = 300;
const HOLD_PAD_MS = 200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}
// "open" is the control: no hold at all, silence goes up between the sentences as from an open microphone in a quiet room.
const RELEASE = arg("release", "end") as "end" | "zeros" | "open";
const LEVELS = arg("levels", "off,-10,0").split(",");
const RUNS = Number(arg("runs", "3"));
const CONC = Number(arg("conc", "3"));
const VERTEX = process.argv.includes("--vertex");
const GAP_MS = Number(arg("gap-ms", "0"));

const HOLDS = [
  join(ROOT, "e2e/fixtures/hero-en.wav"),
  join(ROOT, "e2e/fixtures/fries-en.wav"),
  join(DIR, "audio/user-no-thanks-en.wav"),
  join(DIR, "audio/user-pay-en.wav"),
  join(DIR, "audio/user-yes-en.wav"),
];
const CROWD = ["chat-en.wav", "order-en.wav", "chat-ko.wav", "order-ko.wav"];

function load(path: string): Float32Array {
  const { rate, samples } = readWav(readFileSync(path));
  return Float32Array.from(downsampleTo16k(Float32Array.from(samples, (s) => s / 0x8000), rate), (s) => s / 0x8000);
}
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
function trim(x: Float32Array): Float32Array {
  const thr = x.reduce((a, v) => Math.max(a, Math.abs(v)), 0) * 10 ** (-35 / 20);
  let a = 0;
  let b = x.length - 1;
  while (a < b && Math.abs(x[a]) < thr) a++;
  while (b > a && Math.abs(x[b]) < thr) b--;
  return x.subarray(a, b + 1);
}
const b64 = (f: Float32Array) => int16ToBase64(Int16Array.from(f, (s) => Math.round(Math.max(-1, Math.min(1, s)) * 0x7fff)));

/** Two minutes of bystanders, one clip after another, at `level` dB relative to the user. */
function crowdTrack(level: string, run: number): Float32Array {
  const out = new Float32Array(120 * RATE);
  if (level === "off") return out;
  let at = 0;
  for (let i = run; at < out.length; i++) {
    const clip = atLevel(load(join(DIR, "audio", CROWD[i % CROWD.length])), USER_DBFS + Number(level));
    out.set(clip.subarray(0, Math.min(clip.length, out.length - at)), at);
    at += clip.length + 0.4 * RATE;
  }
  return out;
}

async function one(level: string, run: number) {
  const store = new MemoryStore();
  const started = Date.now();
  const now = () => CLOCK + (Date.now() - started);
  const { sessionId, deviceToken } = await createSession(store, { kioskId: "malo", demo: true }, now());
  const bearer = deviceToken!;
  await runCommand(store, { body: { sessionId, commandId: randomUUID(), type: "setDineOption", args: { option: "eat_in" }, source: "button" }, bearer }, now());
  const session = (await store.get(sessionId))!;
  const config = liveConfig(kiosk, { cart: session.cart, status: session.status, dineOption: session.dineOption, locale: "en" });
  const ai = VERTEX
    ? new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT || "kibo-2026", location: process.env.VOICE_VERTEX_LOCATION || "us-central1" })
    : new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: "v1alpha" } });
  const crowd = crowdTrack(level, run);
  const liveSessionId = randomUUID();
  let turns = initialTurns();
  let playEnd = 0;
  let lastOutput = 0;
  let turnCompleteAt = 0;
  let pendingTools = Promise.resolve();
  let busyTools = 0;
  let live: LiveSession | null = null;
  let closed = false;
  const cmds: string[] = [];
  let heard = "";

  const onmessage = (m: LiveServerMessage) => {
    for (const e of turnEvents(m)) turns = turnsReducer(turns, e);
    const sc = m.serverContent;
    if (sc?.inputTranscription?.text) heard += sc.inputTranscription.text;
    for (const p of sc?.modelTurn?.parts ?? []) {
      const data = p.inlineData?.data;
      if (!data) continue;
      lastOutput = performance.now();
      playEnd = Math.max(performance.now(), playEnd) + ((Buffer.from(data, "base64").length / 2) / 24000) * 1000;
    }
    const calls = m.toolCall?.functionCalls ?? [];
    if (calls.length > 0) {
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
          locale: "en",
          send: async (cmd) => runCommand(store, { body: { sessionId, ...cmd }, bearer }, now()),
          onAction: (a) => cmds.push(`${a.tool}:${a.code}`),
        });
        busyTools--;
        if (!closed) live?.sendToolResponse({ functionResponses: responses as FunctionResponse[] });
      });
    }
    if (sc?.turnComplete) turnCompleteAt = performance.now();
  };

  live = await ai.live.connect({
    model: config.model,
    config: liveConnectConfig(config.system, config.tools, config.languageCode),
    callbacks: { onmessage, onerror: () => {}, onclose: () => (closed = true) },
  });
  const t0 = performance.now();
  const crowdAt = () => Math.floor(((performance.now() - t0) / 1000) * RATE) % (crowd.length - FRAME);
  const silence = b64(new Float32Array(FRAME));
  const reactions: (number | null)[] = [];

  for (const [n, file] of HOLDS.entries()) {
    if (closed) break;
    // A long quiet gap before the third hold: nothing goes over the socket.
    if (n === 2 && GAP_MS > 0) await sleep(GAP_MS);
    const user = atLevel(trim(load(file)), USER_DBFS);
    const pad = (HOLD_PAD_MS * RATE) / 1000;
    const total = pad + user.length + pad;
    const startAt = performance.now();
    // The hold: the user's words over whatever the bystanders are saying right now.
    for (let i = 0; i + FRAME <= total; i += FRAME) {
      const wait = startAt + (i / RATE) * 1000 - performance.now();
      if (wait > 0) await sleep(wait);
      const frame = new Float32Array(FRAME);
      const c = crowdAt();
      for (let j = 0; j < FRAME; j++) {
        const u = i + j - pad;
        frame[j] = crowd[c + j] + (u >= 0 && u < user.length ? user[u] : 0);
      }
      live.sendRealtimeInput({ audio: { data: b64(frame), mimeType: "audio/pcm;rate=16000" } });
    }
    // The release.
    const released = performance.now();
    if (RELEASE === "end") live.sendRealtimeInput({ audioStreamEnd: true });
    else if (RELEASE === "zeros") {
      for (let k = 0; k < 30; k++) {
        live.sendRealtimeInput({ audio: { data: silence, mimeType: "audio/pcm;rate=16000" } });
        await sleep(40);
      }
    }
    // Wait for the AI: its first output, then the end of its reply and of its tool calls.
    let reaction: number | null = null;
    while (performance.now() - released < 20_000 && !closed) {
      await sleep(40);
      // Half-duplex, as the phone: nothing goes up while the AI's voice plays or just after.
      if (RELEASE === "open" && performance.now() > playEnd + MUTE_TAIL_MS) live.sendRealtimeInput({ audio: { data: silence, mimeType: "audio/pcm;rate=16000" } });
      if (reaction === null && lastOutput > released) reaction = Math.round(lastOutput - released);
      const quiet = performance.now() - Math.max(lastOutput, playEnd) > 1500;
      if (reaction !== null && turnCompleteAt > released && busyTools === 0 && quiet) break;
      if (reaction === null && performance.now() - released > 8000) break;
    }
    reactions.push(reaction);
    await sleep(MUTE_TAIL_MS);
  }
  await pendingTools;
  closed = true;
  live.close();
  const end = (await store.get(sessionId))!;
  return { level, run, model: config.model, gapMs: GAP_MS, reactions, status: end.status, heroCart: sameOrder(end.cart), cart: end.cart, cmds, heard };
}

async function main() {
  const jobs = LEVELS.flatMap((level) => Array.from({ length: RUNS }, (_, run) => ({ level, run })));
  const results: Awaited<ReturnType<typeof one>>[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        try {
          const r = await one(job.level, job.run);
          results.push(r);
          console.log(JSON.stringify({ level: r.level, run: r.run, reactions: r.reactions, status: r.status, heroCart: r.heroCart, cmds: r.cmds }));
        } catch (e) {
          console.log(JSON.stringify({ ...job, error: e instanceof Error ? e.message.slice(0, 200) : "error" }));
        }
      }
    }),
  );
  mkdirSync(join(DIR, "logs"), { recursive: true });
  const name = `multi-${RELEASE}${VERTEX ? "-vertex" : ""}${GAP_MS ? `-gap${GAP_MS / 1000}s` : ""}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(join(DIR, "logs", name), JSON.stringify(results, null, 1));
  console.log(`\nfive holds, release = ${RELEASE}${VERTEX ? ", Vertex AI" : ""}`);
  for (const level of LEVELS) {
    const rows = results.filter((r) => r.level === level);
    const answered = rows.reduce((n, r) => n + r.reactions.filter((x) => x !== null).length, 0);
    const holds = rows.reduce((n, r) => n + r.reactions.length, 0);
    console.log(
      `  ${level.padStart(4)}: holds answered ${answered} of ${holds}; reached paying ${rows.filter((r) => r.status === "paying").length} of ${rows.length}; hero cart ${rows.filter((r) => r.heroCart).length} of ${rows.length}`,
    );
  }
  console.log(`log: spikes/crowd-voice/logs/${name}`);
}

main().catch((e) => {
  console.error("run failed:", e instanceof Error ? e.message : "error");
  process.exit(1);
});
