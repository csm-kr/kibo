// The judge of the crowd benchmark (docs/GOAL.md "Speaker-aware listening"). Scores a candidate's files in
// out/<candidate>/ against the frozen set and prints each cell as k of n with a Wilson 95% interval, and the adopt line
// (read on the rival-order 0 dB cell, small talk at 0 dB beside it). Refuses to run when an input or reference
// differs from manifest.json / refs.json, or when a candidate's out/<candidate>/MANIFEST names another benchmark.
//
//   npx tsx --env-file=.env spikes/speaker-gate/bench/score.ts --candidate <name> --layer words|live|all
//     [--runs 6] [--cells en/order@0,ko/order@0] [--method A|B|C] [--conc 4] [--fresh]
//
// --runs defaults to 6 (screening). 20 runs per cell only for the best stacks on the adopt cells; the adopt verdict
// needs 20 and says "not evaluable" below that.
// Word layer: one fixed transcriber (gemini-3.8-flash, temperature 0, pinned below) writes what it hears in the audio
// the candidate passes on; customer words kept and bystander words leaked are counted against the references.
// Live layer: real Gemini Live with the phone's pinned config, the way spikes/crowd-voice/run.ts sends a mix (40 ms
// frames in real time, half-duplex, tool calls through the real command path on a memory store). Every run is
// appended to logs/live-<candidate>.jsonl as it finishes; a rerun skips runs already logged for this manifest
// (--fresh starts over). Every log names the manifest, the commit and whether src/, data/ or skills/ had changes.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI, type FunctionResponse, type LiveServerMessage, type Session as LiveSession } from "@google/genai";
import { getKiosk } from "@/lib/adapters/catalog";
import { liveConfig, liveConnectConfig } from "@/lib/agent/live";
import { HERO_CART, median } from "@/lib/demo/compare";
import { createSession, runCommand } from "@/lib/session/service";
import { MemoryStore } from "@/lib/store/memory";
import { int16ToBase64 } from "@/lib/voice/pcm";
import { runToolCalls } from "@/lib/voice/toolRunner";
import { initialTurns, turnEvents, turnsReducer } from "@/lib/voice/turns";
import { RATE, decodeWav, encodeWav, sha256 } from "./audio";
import { isQuotaError, ledger } from "./spend";
import { adoptVerdict, bystanderItemsAdded, frameActions, isRight, resolveChain, type Lang, wilson, wordScore, yesAccepted } from "./scoring";

const BENCH = join(process.cwd(), "spikes/speaker-gate/bench");
/** The transcriber is part of the judge: changing the model or the prompt makes a different judge. */
export const TRANSCRIBER = {
  model: "gemini-3.8-flash",
  version: 1,
  prompt:
    "Transcribe every word spoken in this audio, verbatim, in the language it is spoken in (English or Korean). " +
    "Several people may talk at once: write all the words you can make out. Write numbers as words. " +
    "Output only the transcript as plain text, with no labels, speaker names, timestamps or notes. If nothing is spoken, output nothing.",
};
const KIOSK = "malo";
const CLOCK = Date.parse("2026-10-13T05:00:00Z");
const FRAME_MS = 40;
const FRAME = (RATE * FRAME_MS) / 1000;
const MUTE_TAIL_MS = 300;
const MAX_DELAY_MS = { A: 1500, B: 500, C: 500 };
/** The adopt line's cell (a rival order at 0 dB: the only talk that can put items in the cart) and its neighbour. */
const ADOPT_CELL = "order@0";
const BESIDE_CELL = "chat@0";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Spend stops (kibo-59, 11-26): --cap-won <won> is required for any run; it refuses to start, and stops before the
 *  next Live session, once the ledger (spend.ts) has reached the cap. The first 402 or 429 ends the run at once. */
function capCheck(where: string) {
  const i = process.argv.indexOf("--cap-won");
  const cap = i > 0 ? Number(process.argv[i + 1]) : NaN;
  if (!Number.isFinite(cap)) {
    console.error("--cap-won <won> is required (no default): the ledger in logs/spend.json must stay under it");
    process.exit(4);
  }
  const l = ledger();
  if (l.totalWon >= cap) {
    console.error(`spend cap reached ${where}: ledger about ₩${l.totalWon} >= cap ₩${cap}; stopped`);
    process.exit(4);
  }
}
function quotaStop(e: unknown, where: string) {
  if (!isQuotaError(e)) return;
  console.error(`API refused for quota or credit (${where}): ${e instanceof Error ? e.message.slice(0, 200) : JSON.stringify(e).slice(0, 200)}; stopped`);
  process.exit(3);
}
const CALLS = join(BENCH, "logs", "calls.jsonl");

/** --instructions <file>: text appended to the pinned Live instructions (a meaning layer such as l3-instr). It changes
 *  no trial and no scoring; every run logs the file and its sha256, and runs go to the stack's own log (--as). */
const INSTRUCTIONS = (() => {
  const i = process.argv.indexOf("--instructions");
  if (i < 0) return null;
  const file = process.argv[i + 1];
  const text = readFileSync(file, "utf8");
  return { file, sha256: sha256(Buffer.from(text)), text };
})();
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}
const pct = (k: number, n: number) => (n ? `${Math.round((100 * k) / n)}%` : "-");
function kOfN(k: number, n: number): string {
  const [lo, hi] = wilson(k, n);
  return `${k}/${n} [${Math.round(lo * 100)}-${Math.round(hi * 100)}%]`;
}

/** The judge imports src/, so every log names the code it measured: the commit and any change to src/, data/, skills/. */
function gitStamp() {
  const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8" }).trim();
  return { commit: git("rev-parse", "HEAD"), dirty: git("status", "--porcelain", "src/", "data/", "skills/") };
}

// ---- The frozen set ----

interface Placed {
  text: string;
  kind: string;
  complete: boolean;
}
interface Ref {
  id: string;
  set: "words" | "live";
  lang: Lang;
  cell: string;
  content: string | null;
  review: boolean;
  voices: string;
  lengthMs: number;
  customer: { text: string; kind: string; startMs: number; endMs: number } | null;
  bystanders: Placed[];
  files: Record<string, string>;
}
type BenchSet = { manifestSha: string; cells: Record<string, string[]>; refs: Record<string, Ref> };

function loadSet(): BenchSet {
  const manifestRaw = readFileSync(join(BENCH, "manifest.json"));
  const manifest = JSON.parse(manifestRaw.toString()) as { trials: { id: string; mix: string; enrol: string }[] };
  const refsJson = JSON.parse(readFileSync(join(BENCH, "refs.json"), "utf8")) as { cells: Record<string, string[]>; trials: Record<string, Ref> };
  const bad: string[] = [];
  const same = (p: string, h: string) => existsSync(p) && sha256(readFileSync(p)) === h;
  for (const t of manifest.trials) {
    for (const f of ["mix", "enrol"] as const) if (!same(join(BENCH, "inputs", t.id, `${f}.wav`), t[f])) bad.push(`inputs/${t.id}/${f}.wav`);
    const ref = refsJson.trials[t.id];
    if (!ref) bad.push(`refs ${t.id}`);
    else for (const [f, h] of Object.entries(ref.files)) if (!same(join(BENCH, "refs", t.id, `${f}.wav`), h)) bad.push(`refs/${t.id}/${f}.wav`);
  }
  if (bad.length) throw new Error(`the benchmark differs from manifest.json/refs.json (${bad.length} files, e.g. ${bad.slice(0, 3).join(", ")}): rebuild with build.ts`);
  return { manifestSha: sha256(manifestRaw), cells: refsJson.cells, refs: refsJson.trials };
}

// ---- A candidate's output for one trial ----

interface Meta {
  latency_ms: number;
  input_from?: string;
  out_offset_ms?: number;
  segments?: [number, number][];
  text_turns?: { at_ms: number; text: string }[];
}

function checkManifest(cand: string, manifestSha: string) {
  const p = join(BENCH, "out", cand, "MANIFEST");
  const got = existsSync(p) ? readFileSync(p, "utf8").trim() : "(none)";
  if (got !== manifestSha) throw new Error(`out/${cand}/MANIFEST is ${got.slice(0, 12)}, the benchmark is ${manifestSha.slice(0, 12)}: outputs made for another benchmark`);
}

function readMeta(cand: string, id: string): Meta | null {
  const p = join(BENCH, "out", cand, id, "meta.json");
  if (!existsSync(p)) return null;
  const m = JSON.parse(readFileSync(p, "utf8")) as Meta;
  if (typeof m.latency_ms !== "number" || m.latency_ms < 0) throw new Error(`out/${cand}/${id}: latency_ms must be a number >= 0`);
  return m;
}

/** What the candidate (or its chain) passes on for one trial: audio on the mix's time base, its segments or text turns,
 *  and its total delay. out.wav may start at out_offset_ms and be shorter than the mix; the rest is silence. */
function candidateTrial(cand: string, ref: Ref, set: BenchSet) {
  const chain = resolveChain(cand, (c) => {
    const m = readMeta(c, ref.id);
    return m && { ...m, hasAudio: existsSync(join(BENCH, "out", c, ref.id, "out.wav")) };
  });
  for (const c of chain.chain) checkManifest(c, set.manifestSha);
  const meta = readMeta(cand, ref.id)!;
  const mix = decodeWav(readFileSync(join(BENCH, "inputs", ref.id, "mix.wav"))).x;
  let audio = mix;
  if (chain.audioFrom) {
    const m = readMeta(chain.audioFrom, ref.id)!;
    const o = decodeWav(readFileSync(join(BENCH, "out", chain.audioFrom, ref.id, "out.wav")));
    const off = Math.round(((m.out_offset_ms ?? 0) * RATE) / 1000);
    if (o.rate !== RATE || off < 0 || off + o.x.length > mix.length) throw new Error(`out/${chain.audioFrom}/${ref.id}/out.wav must be 16 kHz and fit inside mix.wav from out_offset_ms`);
    audio = new Float32Array(mix.length);
    audio.set(o.x, off);
  }
  return { meta, audio, latencyMs: chain.latencyMs, chain: chain.chain };
}

/** The audio a gate lets through: silence outside its segments. */
function gated(audio: Float32Array, segments: [number, number][] | undefined): Float32Array {
  if (!segments) return audio;
  const out = new Float32Array(audio.length);
  for (const [s, e] of segments) {
    const a = Math.max(0, Math.round((s * RATE) / 1000));
    const b = Math.min(audio.length, Math.round((e * RATE) / 1000));
    if (b > a) out.set(audio.subarray(a, b), a);
  }
  return out;
}

const toPcm = (x: Float32Array) => Int16Array.from(x, (s) => Math.round(Math.max(-1, Math.min(1, s)) * 0x7fff));

// ---- Word layer ----

const CACHE = join(BENCH, "work", "transcripts.json");

async function transcribe(ai: GoogleGenAI, wav: Buffer, cache: Record<string, string>): Promise<string> {
  const key = `${TRANSCRIBER.model}|v${TRANSCRIBER.version}|${sha256(wav)}`;
  if (key in cache) return cache[key];
  for (let attempt = 0; ; attempt++) {
    try {
      const t0 = performance.now();
      const res = await ai.models.generateContent({
        model: TRANSCRIBER.model,
        contents: [{ role: "user", parts: [{ inlineData: { mimeType: "audio/wav", data: wav.toString("base64") } }, { text: TRANSCRIBER.prompt }] }],
        config: { temperature: 0, thinkingConfig: { thinkingLevel: "low" as never } },
      });
      const text = (res.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
      appendFileSync(CALLS, JSON.stringify({ at: new Date().toISOString(), kind: "transcribe", model: TRANSCRIBER.model, ms: Math.round(performance.now() - t0), usage: res.usageMetadata ?? null }) + "\n");
      cache[key] = text;
      return text;
    } catch (e) {
      quotaStop(e, "transcriber");
      if (attempt >= 3) throw e;
      await sleep(2000 * (attempt + 1));
    }
  }
}

/** A trial "keeps" the customer when 90% or more of their words come through, and "leaks" when 20% or more of the
 *  bystanders' words do; these per-trial counts carry the intervals (words inside one trial are not independent). */
const KEEP_AT = 0.9;
const LEAK_AT = 0.2;

async function wordLayer(cand: string, set: BenchSet, conc: number) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  mkdirSync(join(BENCH, "work"), { recursive: true });
  const cache: Record<string, string> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  // --trials a,b,c or a file with one id per line: a named slice (a development sweep); the log records it.
  const only = arg("trials", "");
  const slice = only ? new Set((existsSync(only) ? readFileSync(only, "utf8") : only).split(/[\s,]+/).filter(Boolean)) : null;
  const trials = Object.values(set.refs).filter((r) => r.set === "words" && (!slice || slice.has(r.id)));
  type Row = ReturnType<typeof wordScore> & { trial: string; lang: string; cell: string; voices: string; transcript: string; latencyMs: number };
  const rows: Row[] = [];
  let next = 0;
  let calls = 0;
  await Promise.all(
    Array.from({ length: conc }, async () => {
      while (next < trials.length) {
        const ref = trials[next++];
        const { meta, audio, latencyMs } = candidateTrial(cand, ref, set);
        let transcript: string;
        if (meta.text_turns) transcript = meta.text_turns.map((t) => t.text).join(" ");
        else {
          const x = gated(audio, meta.segments);
          // Silence has no words; no call needed.
          if (x.every((s) => Math.abs(s) < 1 / 0x8000)) transcript = "";
          else {
            const before = Object.keys(cache).length;
            transcript = await transcribe(ai, encodeWav(toPcm(x)), cache);
            if (Object.keys(cache).length > before) calls++;
          }
        }
        const s = wordScore(transcript, ref.customer?.text ?? "", ref.bystanders.map((b) => b.text), ref.lang);
        rows.push({ trial: ref.id, lang: ref.lang, cell: ref.cell, voices: ref.voices, ...s, transcript, latencyMs });
      }
    }),
  );
  // Merge with what other sessions wrote meanwhile, then replace the file in one step.
  const disk: Record<string, string> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  const tmp = `${CACHE}.${process.pid}`;
  writeFileSync(tmp, JSON.stringify({ ...disk, ...cache }, null, 1));
  renameSync(tmp, CACHE);
  const groups = new Map<string, Row[]>();
  for (const r of rows) groups.set(`${r.lang}/${r.cell}`, [...(groups.get(`${r.lang}/${r.cell}`) ?? []), r]);
  const cells = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([cell, rs]) => {
    const sum = (f: (r: Row) => number) => rs.reduce((a, r) => a + f(r), 0);
    const withCustomer = rs.filter((r) => r.customerTotal > 0);
    const withBystander = rs.filter((r) => r.bystanderTotal > 0);
    return {
      cell,
      n: rs.length,
      keptPct: sum((r) => r.customerTotal) ? Math.round((100 * sum((r) => r.kept)) / sum((r) => r.customerTotal)) : null,
      trialsKept: { k: withCustomer.filter((r) => r.kept >= KEEP_AT * r.customerTotal).length, n: withCustomer.length },
      leakedPct: sum((r) => r.bystanderTotal) ? Math.round((100 * sum((r) => r.leaked)) / sum((r) => r.bystanderTotal)) : null,
      trialsLeaking: { k: withBystander.filter((r) => r.leaked >= LEAK_AT * r.bystanderTotal).length, n: withBystander.length },
      neitherPerTrial: Math.round((sum((r) => r.neither) / rs.length) * 10) / 10,
    };
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync(join(BENCH, "logs"), { recursive: true });
  const logName = `words-${cand}${slice ? "-slice" : ""}-${stamp}.json`;
  writeFileSync(join(BENCH, "logs", logName), JSON.stringify({ candidate: cand, slice: slice ? [...slice].sort() : null, manifestSha: set.manifestSha, ...gitStamp(), transcriber: TRANSCRIBER, keepAt: KEEP_AT, leakAt: LEAK_AT, cells, rows }, null, 1));
  console.log(`\nword layer, ${cand} (${rows.length} trials, ${calls} new transcriber calls; manifest ${set.manifestSha.slice(0, 12)})`);
  console.log(`cell                     n  kept%  trials kept>=90%      leaked%  trials leaking>=20%   neither/trial`);
  for (const c of cells) {
    const tk = c.trialsKept.n ? kOfN(c.trialsKept.k, c.trialsKept.n) : "-";
    const tl = c.trialsLeaking.n ? kOfN(c.trialsLeaking.k, c.trialsLeaking.n) : "-";
    console.log(`${c.cell.padEnd(23)}${String(c.n).padStart(3)} ${String(c.keptPct ?? "-").padStart(5)}  ${tk.padEnd(20)} ${String(c.leakedPct ?? "-").padStart(7)}  ${tl.padEnd(20)} ${String(c.neitherPerTrial).padStart(6)}`);
  }
  console.log(`log: spikes/speaker-gate/bench/logs/${logName}`);
}

// ---- Live layer ----

interface Event {
  t: number;
  kind: "heard" | "said" | "audio" | "tool" | "cmd" | "turnComplete" | "interrupted";
  text?: string;
}

async function liveRun(ref: Ref, meta: Meta, audio: Float32Array, latencyMs: number) {
  const kiosk = getKiosk(KIOSK);
  const store = new MemoryStore();
  const started = Date.now();
  const now = () => CLOCK + (Date.now() - started);
  const { sessionId, deviceToken } = await createSession(store, { kioskId: KIOSK, demo: true }, now());
  const bearer = deviceToken!;
  const send = (type: string, args: object, extra: object = {}) =>
    runCommand(store, { body: { sessionId, commandId: randomUUID(), type, args, source: "button", ...extra }, bearer }, now());
  await send("setDineOption", { option: "eat_in" });
  let seq = 0;
  if (ref.review) {
    // run.ts review: the order is in and the AI opened the review after the customer's first utterance.
    seq = 1;
    for (const line of HERO_CART) await send("addToCart", line, { source: "voice", utteranceSeq: seq });
    await send("requestCheckout", {}, { source: "voice", utteranceSeq: seq });
  }
  const session = (await store.get(sessionId))!;
  const base0 = liveConfig(kiosk, { cart: session.cart, status: session.status, dineOption: session.dineOption, locale: ref.lang });
  const config = INSTRUCTIONS ? { ...base0, system: `${base0.system}\n\n${INSTRUCTIONS.text.trim()}` } : base0;
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: "v1alpha" } });
  const liveSessionId = randomUUID();
  const events: Event[] = [];
  const tools: { name: string; args: Record<string, unknown> }[] = [];
  const usage: object[] = [];
  let t0 = 0;
  const t = () => Math.round(performance.now() - t0);
  let turns = initialTurns(seq);
  let playEnd = 0;
  let responding = false;
  let pendingTools = Promise.resolve();
  let live: LiveSession | null = null;
  let closed = false;

  const onmessage = (m: LiveServerMessage) => {
    if (m.usageMetadata) usage.push(m.usageMetadata);
    for (const e of turnEvents(m)) turns = turnsReducer(turns, e);
    const sc = m.serverContent;
    if (sc?.inputTranscription?.text) events.push({ t: t(), kind: "heard", text: sc.inputTranscription.text });
    if (sc?.outputTranscription?.text) events.push({ t: t(), kind: "said", text: sc.outputTranscription.text });
    for (const p of sc?.modelTurn?.parts ?? []) {
      const data = p.inlineData?.data;
      if (!data) continue;
      if (!responding) events.push({ t: t(), kind: "audio" });
      responding = true;
      const ms = (Buffer.from(data, "base64").length / 2 / 24000) * 1000;
      playEnd = Math.max(performance.now(), playEnd) + ms;
    }
    const calls = m.toolCall?.functionCalls ?? [];
    if (calls.length > 0) {
      const utteranceSeq = turns.seq;
      for (const c of calls) {
        events.push({ t: t(), kind: "tool", text: `${c.name} ${JSON.stringify(c.args)}` });
        tools.push({ name: c.name ?? "", args: (c.args ?? {}) as Record<string, unknown> });
      }
      pendingTools = pendingTools.then(async () => {
        const responses = await runToolCalls(calls, {
          liveSessionId,
          utteranceSeq,
          cartVersion: () => session.cartVersion,
          kiosk,
          locale: ref.lang,
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

  const connectStart = performance.now();
  live = await ai.live.connect({
    model: config.model,
    config: liveConnectConfig(config.system, config.tools, config.languageCode),
    callbacks: {
      onmessage,
      onerror: () => {},
      onclose: (ev) => {
        closed = true;
        // A session refused for quota or credit closes with the reason; stop the whole run.
        quotaStop({ reason: ev?.reason, code: ev?.code }, "Live close");
      },
    },
  });
  // On the review the 1.5 s wait after requestCheckout (CONFIRM_WAIT_MS) has passed before anyone speaks (run.ts).
  await sleep(ref.review ? 1600 : 200);
  // The candidate's delay: its stream starts latencyMs late, so mix time m reaches Live at t0 + m + latency.
  const lat = Math.round(latencyMs);
  const shifted = new Float32Array(Math.round((lat * RATE) / 1000) + audio.length);
  shifted.set(audio, shifted.length - audio.length);
  const segs = meta.segments?.map(([s, e]) => [s + lat, e + lat] as [number, number]) ?? null;
  const actions = frameActions((shifted.length / RATE) * 1000, segs, FRAME_MS);
  const textTurns = (meta.text_turns ?? []).map((x) => ({ at: x.at_ms + lat, text: x.text })).sort((a, b) => a.at - b.at);
  t0 = performance.now();
  let sent = 0;
  let dropped = 0;
  let pendingEnd = false;
  let open = false;
  for (let k = 0; k < actions.length && !closed; k++) {
    const atMs = k * FRAME_MS;
    const wait = t0 + atMs - performance.now();
    if (wait > 0) await sleep(wait);
    if (meta.text_turns) {
      while (textTurns.length && textTurns[0].at <= atMs) {
        live.sendRealtimeInput({ text: textTurns.shift()!.text });
        sent++;
      }
      continue;
    }
    // Half-duplex: the phone sends nothing while the AI's voice plays and for 300 ms after.
    const muted = performance.now() < playEnd + MUTE_TAIL_MS;
    const a = actions[k];
    if (a === "end") pendingEnd = true;
    if (a === "send") open = true;
    if (muted) {
      if (a === "send") dropped++;
      continue;
    }
    if (pendingEnd && a !== "send") {
      live.sendRealtimeInput({ audioStreamEnd: true });
      pendingEnd = false;
      open = false;
    }
    if (a === "send") {
      live.sendRealtimeInput({ audio: { data: int16ToBase64(toPcm(shifted.subarray(k * FRAME, (k + 1) * FRAME))), mimeType: "audio/pcm;rate=16000" } });
      sent++;
    }
  }
  if (segs && (open || pendingEnd) && !closed) live.sendRealtimeInput({ audioStreamEnd: true });
  await sleep(1500);
  await pendingTools;
  closed = true;
  live.close();
  const end = (await store.get(sessionId))!;
  const outputs = events.filter((e) => e.kind === "audio" || e.kind === "tool").map((e) => e.t);
  const base = {
    status: end.status,
    cart: end.cart.map((l) => ({ itemId: l.itemId, qty: l.qty, variant: l.variant, selections: l.selections })),
    heard: events.filter((e) => e.kind === "heard").map((e) => e.text).join(""),
    events,
    usage,
    sent,
    dropped,
    sessionS: Math.round((performance.now() - connectStart) / 100) / 10,
    model: config.model,
  };
  // The review: "tried" is the AI calling confirmCheckout on a bystander's yes (what a filter can change); "accepted"
  // is the server taking it as a fresh utterance and moving the order to paying (it does on the open microphone).
  const confirmTried = tools.some((c) => c.name === "confirmCheckout");
  if (ref.review) return { ...base, ok: !yesAccepted(end.status) && !confirmTried, yesAccepted: yesAccepted(end.status), confirmTried, reactionMs: null, bystanderItems: [] as string[] };
  const c = ref.customer!;
  const right = isRight({ userStartMs: c.startMs, userEndMs: c.endMs, outputs, cart: end.cart, latencyMs: lat });
  return { ...base, ...right, yesAccepted: null, confirmTried, bystanderItems: bystanderItemsAdded(tools, end.cart) };
}

type LiveRow = { manifestSha: string; cell: string; trial: string; ok: boolean; yesAccepted: boolean | null; confirmTried?: boolean; reactionMs: number | null; bystanderItems: string[]; error?: string };

function readLog(file: string, manifestSha: string): LiveRow[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as LiveRow)
    .filter((r) => !r.error && r.manifestSha === manifestSha);
}

function cellSummary(rows: LiveRow[]) {
  const reactions = rows.filter((r) => r.ok && r.reactionMs !== null).map((r) => r.reactionMs!);
  return {
    n: rows.length,
    right: rows.filter((r) => r.ok).length,
    withBystanderItems: rows.filter((r) => r.bystanderItems.length > 0).length,
    yesAccepted: rows.filter((r) => r.yesAccepted === true).length,
    confirmTried: rows.filter((r) => r.confirmTried === true).length,
    medianReactionMs: reactions.length ? Math.round(median(reactions)) : null,
  };
}

async function liveLayer(cand: string, stack: string, set: BenchSet, runs: number, cells: string[], conc: number, fresh: boolean, method: "A" | "B" | "C") {
  mkdirSync(join(BENCH, "logs"), { recursive: true });
  const log = join(BENCH, "logs", `live-${stack}.jsonl`);
  if (fresh && existsSync(log)) writeFileSync(log, "");
  const done = new Set(readLog(log, set.manifestSha).map((r) => r.trial));
  const jobs = cells.flatMap((cell) => {
    const ids = set.cells[`live/${cell}`];
    if (!ids) throw new Error(`no live cell ${cell}`);
    return ids.slice(0, runs).map((id, run) => ({ cell, id, run })).filter((j) => !done.has(j.id));
  });
  console.log(`live layer, ${stack}: ${jobs.length} sessions to run (${done.size} already in logs/live-${stack}.jsonl for this manifest)`);
  let next = 0;
  await Promise.all(
    Array.from({ length: conc }, async () => {
      while (next < jobs.length) {
        const j = jobs[next++];
        capCheck("before a Live session");
        const ref = set.refs[j.id];
        const stamp = gitStamp();
        if (stamp.dirty) {
          console.error(`src/, data/ or skills/ changed while running (${stamp.dirty.split("\n")[0]}): stopped; tell kibo-59`);
          process.exit(2);
        }
        const base = { stack, candidate: cand, instructions: INSTRUCTIONS && { file: INSTRUCTIONS.file, sha256: INSTRUCTIONS.sha256 }, manifestSha: set.manifestSha, ...stamp, cell: j.cell, trial: j.id, run: j.run, at: new Date().toISOString() };
        try {
          const { meta, audio, latencyMs, chain } = candidateTrial(cand, ref, set);
          const r = await liveRun(ref, meta, audio, latencyMs);
          appendFileSync(log, JSON.stringify({ ...base, chain, latencyMs, ...r }) + "\n");
          const what = ref.review ? `yes ${r.yesAccepted ? "accepted" : "not accepted"}` : `${r.ok ? "right" : "wrong"} reaction ${r.reactionMs} ms items [${r.bystanderItems.join(",")}]`;
          console.log(`${j.cell} run ${j.run} ${j.id}: ${what} ${r.sessionS} s`);
        } catch (e) {
          quotaStop(e, "Live session");
          appendFileSync(log, JSON.stringify({ ...base, error: e instanceof Error ? e.message.slice(0, 300) : "error" }) + "\n");
          console.log(`${j.cell} run ${j.run}: error ${e instanceof Error ? e.message.slice(0, 120) : ""}`);
        }
      }
    }),
  );
  // Summary over everything logged for this manifest in the asked cells, the first `runs` trials of each.
  const all = readLog(log, set.manifestSha);
  const openRows = readLog(join(BENCH, "logs", "live-open.jsonl"), set.manifestSha);
  const holdRows = readLog(join(BENCH, "logs", "live-hold-oracle.jsonl"), set.manifestSha);
  const pick = (rows: LiveRow[], cell: string) => {
    const ids = new Set((set.cells[`live/${cell}`] ?? []).slice(0, runs));
    return rows.filter((r) => ids.has(r.trial));
  };
  // Extra column, not part of the verdict: median reaction minus hold-oracle's in the same cell and trials.
  const summary = cells.map((cell) => {
    const s = cellSummary(pick(all, cell));
    const h = cellSummary(pick(holdRows, cell));
    return { cell, ...s, vsHoldOracleMs: s.medianReactionMs !== null && h.medianReactionMs !== null ? s.medianReactionMs - h.medianReactionMs : null };
  });
  console.log(`\nlive layer, ${stack}, first ${runs} trials per cell (manifest ${set.manifestSha.slice(0, 12)}; log spikes/speaker-gate/bench/logs/live-${stack}.jsonl)`);
  console.log("cell                   right                  items outside hero     review: AI tried to confirm / yes accepted   median reaction (right runs), vs hold-oracle");
  for (const s of summary) {
    const review = s.cell.includes("review");
    console.log(
      `${s.cell.padEnd(22)} ${(review ? "-" : kOfN(s.right, s.n)).padEnd(22)} ${(review ? "-" : kOfN(s.withBystanderItems, s.n)).padEnd(22)} ${(review ? `${kOfN(s.confirmTried, s.n)} / ${s.yesAccepted}` : "-").padEnd(43)} ${s.medianReactionMs ?? "-"} ms, ${s.vsHoldOracleMs === null ? "-" : `${s.vsHoldOracleMs > 0 ? "+" : ""}${s.vsHoldOracleMs}`} ms`,
    );
  }
  const verdicts: object[] = [];
  for (const lang of ["en", "ko"]) {
    if (!cells.includes(`${lang}/${ADOPT_CELL}`)) continue;
    const o = cellSummary(pick(all, `${lang}/${ADOPT_CELL}`));
    const beside = cellSummary(pick(all, `${lang}/${BESIDE_CELL}`));
    const alone = cellSummary(pick(all, `${lang}/alone`));
    const today = cellSummary(pick(openRows, `${lang}/alone`));
    const added = alone.medianReactionMs !== null && today.medianReactionMs !== null ? alone.medianReactionMs - today.medianReactionMs : null;
    const v = adoptVerdict({
      overlap0: { runs: o.n, right: o.right, withBystanderItems: o.withBystanderItems },
      aloneRight: alone.right,
      todayAloneRight: today.n === alone.n && today.n > 0 ? today.right : null,
      addedDelayMs: added,
      maxDelayMs: MAX_DELAY_MS[method],
    });
    verdicts.push({ lang, method, ...v, addedDelayMs: added });
    console.log(`adopt line (${lang}, ${ADOPT_CELL}, method ${method}): ${v.verdict.toUpperCase()}${v.reasons.length ? ` (${v.reasons.join("; ")})` : ""}; ${BESIDE_CELL} beside it: right ${kOfN(beside.right, beside.n)}`);
  }
  const sumName = `live-${stack}-summary.json`;
  writeFileSync(join(BENCH, "logs", sumName), JSON.stringify({ stack, candidate: cand, instructions: INSTRUCTIONS && { file: INSTRUCTIONS.file, sha256: INSTRUCTIONS.sha256 }, manifestSha: set.manifestSha, ...gitStamp(), runsPerCell: runs, cells: summary.map((s) => ({ ...s, rightCi: wilson(s.right, s.n), itemsCi: wilson(s.withBystanderItems, s.n), yesCi: wilson(s.yesAccepted, s.n), triedCi: wilson(s.confirmTried, s.n) })), verdicts }, null, 1));
  console.log(`summary: spikes/speaker-gate/bench/logs/${sumName}`);
}

async function main() {
  const cand = arg("candidate", "");
  if (!cand) throw new Error("--candidate <name> is required");
  const layer = arg("layer", "all");
  capCheck("at start");
  const set = loadSet();
  console.log(`benchmark manifest sha256 ${set.manifestSha}`);
  if (layer === "words" || layer === "all") await wordLayer(cand, set, Number(arg("conc", "4")));
  if (layer === "live" || layer === "all") {
    const all = Object.keys(set.cells).filter((c) => c.startsWith("live/")).map((c) => c.slice(5));
    const cells = arg("cells", all.join(",")).split(",");
    // The stack's name: the candidate, plus the instruction file's name when one is added.
    const stack = arg("as", INSTRUCTIONS ? `${cand}+${INSTRUCTIONS.file.split("/").pop()!.replace(/\.[a-z]+$/, "")}` : cand);
    if (INSTRUCTIONS && stack === cand) throw new Error("--as must differ from the candidate when --instructions is given");
    await liveLayer(cand, stack, set, Number(arg("runs", "6")), cells, Number(arg("conc", "4")), process.argv.includes("--fresh"), arg("method", "B") as "A" | "B" | "C");
  }
}

main().catch((e) => {
  console.error("score failed:", e instanceof Error ? e.message : "error");
  process.exit(1);
});
