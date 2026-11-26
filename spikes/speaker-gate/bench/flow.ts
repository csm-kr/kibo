// The flow session on Live (kibo-59, 11-27): one session per flow trial (build-flow.ts), the mix streamed in real
// time with the judge's rules (40 ms frames, half-duplex: nothing while KIBO's voice plays and 300 ms after,
// audioStreamEnd at each gate close, tools through runToolCalls on an in-memory store). Gemini directly, as run.ts.
//
// Stacks:
//   open         every frame goes up; Live's own detector decides the turns (today's open microphone).
//   hold-oracle  frames inside each customer turn +-0.2 s (from refs): a perfect hold to talk.
//   l1-loud      the loudness gate (candidates/l1-loud/gate.ts, its own level test, 40 ms frames) run frame by frame
//                as the app would: told asked() each time KIBO finishes a reply, and opening back to the segment
//                start with the held frames sent at once (catch-up faster than real time, as heldBack does).
//   --gate <json> sets gate options (the 11-27 pick: {"anchor":"first-turn","askDb":0}).
//   --instructions <file> adds text to the pinned Live instructions (l3-flow-live); its sha256 goes in every row.
//
// Right = the final cart is the hero cart (2 cheeseburger sets, large fries, zero cola without pickles and cider),
// the order reached the review or went past it (status confirming or paying: "I'll pay" was acted on; the product
// lets a fresh customer utterance confirm), and no bystander item was ever added.
// Also per session: turns answered (KIBO's first output within 5 s of the end of each customer turn) and spurious
// replies (KIBO starting to talk or calling a tool when no customer turn ended in the 8 s before).
//
//   npx tsx --env-file=.env spikes/speaker-gate/bench/flow.ts --stack open --cap-won 50000 [--runs 6] [--cells ...]
//     [--instructions file --as name] [--conc 3] [--limit N]

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI, type FunctionResponse, type LiveServerMessage, type Session as LiveSession } from "@google/genai";
import { getKiosk } from "@/lib/adapters/catalog";
import { liveConfig, liveConnectConfig } from "@/lib/agent/live";
import { HERO_CART, sameOrder } from "@/lib/demo/compare";
import { createSession, runCommand } from "@/lib/session/service";
import { MemoryStore } from "@/lib/store/memory";
import { int16ToBase64 } from "@/lib/voice/pcm";
import { runToolCalls } from "@/lib/voice/toolRunner";
import { initialTurns, turnEvents, turnsReducer } from "@/lib/voice/turns";
import { loudGate, type GateParams } from "../candidates/l1-loud/gate";
import { RATE, decodeWav, sha256 } from "./audio";
import { isRightFlow } from "./flowScoring";
import { bystanderItemsAdded, wilson } from "./scoring";
import { isQuotaError, ledger } from "./spend";

const BENCH = join(process.cwd(), "spikes/speaker-gate/bench");
const KIOSK = "malo";
const CLOCK = Date.parse("2026-10-13T05:00:00Z");
const FRAME_MS = 40;
const FRAME = (RATE * FRAME_MS) / 1000;
const MUTE_TAIL_MS = 300;
const PAD_MS = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}
const STACK = arg("stack", "");
if (!["open", "hold-oracle", "l1-loud"].includes(STACK)) throw new Error("--stack open|hold-oracle|l1-loud");
const INSTRUCTIONS = (() => {
  const i = process.argv.indexOf("--instructions");
  if (i < 0) return null;
  const file = process.argv[i + 1];
  const text = readFileSync(file, "utf8");
  return { file, sha256: sha256(Buffer.from(text)), text };
})();
const NAME = arg("as", STACK);
// --gate '{"anchor":"first-turn","askDb":0}': gate settings over gate.ts DEFAULTS (l1-loud only), logged per row.
const GATE_PARAMS = JSON.parse(arg("gate", "{}")) as Partial<GateParams>;
// candidates/ is not tracked by git, so every row carries the sha256 of the code that made it.
const FILES = {
  gate: sha256(readFileSync(join(process.cwd(), "spikes/speaker-gate/candidates/l1-loud/gate.ts"))),
  flow: sha256(readFileSync(join(process.cwd(), "spikes/speaker-gate/bench/flow.ts"))),
};
if (INSTRUCTIONS && NAME === STACK) throw new Error("--as <name> is required with --instructions");

function gitStamp() {
  const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8" }).trim();
  return { commit: git("rev-parse", "HEAD"), dirty: git("status", "--porcelain", "src/", "data/", "skills/") };
}
function capCheck(where: string) {
  const cap = Number(arg("cap-won", "NaN"));
  if (!Number.isFinite(cap)) {
    console.error("--cap-won <won> is required (no default)");
    process.exit(4);
  }
  const l = ledger();
  if (l.totalWon >= cap) {
    console.error(`spend cap reached ${where}: ledger about ₩${l.totalWon} >= cap ₩${cap}; stopped`);
    process.exit(4);
  }
  return l.totalWon;
}
function quotaStop(e: unknown, where: string) {
  if (!isQuotaError(e)) return;
  console.error(`API refused for quota or credit (${where}): ${e instanceof Error ? e.message.slice(0, 200) : JSON.stringify(e).slice(0, 200)}; stopped`);
  process.exit(3);
}

interface Turn {
  kind: string;
  text: string;
  startMs: number;
  endMs: number;
}
interface FlowRef {
  id: string;
  lang: "en" | "ko";
  cell: string;
  content: string;
  levelDb: number;
  customer: { voice: string; turns: Turn[] };
  lengthMs: number;
}

/** Scores one session's events against the customer's turns (pure; times in ms on the mix's time base). */
export function flowScore(turns: Turn[], outputs: { t: number; kind: "audio" | "tool" }[]) {
  const answered = turns.map((u) => outputs.some((o) => o.t >= u.endMs && o.t <= u.endMs + 5000));
  const reactions = turns.map((u) => {
    const o = outputs.filter((x) => x.t >= u.endMs).sort((a, b) => a.t - b.t)[0];
    return o && o.t <= u.endMs + 5000 ? Math.round(o.t - u.endMs) : null;
  });
  // A reply's onset: an output more than 1.5 s after the previous one.
  const onsets = outputs
    .map((o) => o.t)
    .sort((a, b) => a - b)
    .filter((t, i, a) => i === 0 || t - a[i - 1] > 1500);
  const spurious = onsets.filter((t) => !turns.some((u) => t >= u.startMs && t <= u.endMs + 8000)).length;
  return { answered: answered.filter(Boolean).length, reactions, spurious };
}

async function one(ref: FlowRef, mix: Float32Array) {
  const kiosk = getKiosk(KIOSK);
  const store = new MemoryStore();
  const started = Date.now();
  const now = () => CLOCK + (Date.now() - started);
  const { sessionId, deviceToken } = await createSession(store, { kioskId: KIOSK, demo: true }, now());
  const bearer = deviceToken!;
  await runCommand(store, { body: { sessionId, commandId: randomUUID(), type: "setDineOption", args: { option: "eat_in" }, source: "button" }, bearer }, now());
  const session = (await store.get(sessionId))!;
  const base0 = liveConfig(kiosk, { cart: session.cart, status: session.status, dineOption: session.dineOption, locale: ref.lang });
  const config = INSTRUCTIONS ? { ...base0, system: `${base0.system}\n\n${INSTRUCTIONS.text.trim()}` } : base0;
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: "v1alpha" } });
  const liveSessionId = randomUUID();
  const events: { t: number; kind: string; text?: string }[] = [];
  const tools: { name: string; args: Record<string, unknown> }[] = [];
  const usage: object[] = [];
  let t0 = performance.now();
  const t = () => Math.round(performance.now() - t0);
  let turns = initialTurns(0);
  let playEnd = 0;
  let responding = false;
  let pendingTools = Promise.resolve();
  let live: LiveSession | null = null;
  let closed = false;
  const gate = STACK === "l1-loud" ? loudGate({ ...GATE_PARAMS, frameMs: FRAME_MS }) : null;

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
      playEnd = Math.max(performance.now(), playEnd) + (Buffer.from(data, "base64").length / 2 / 24000) * 1000;
    }
    const calls = m.toolCall?.functionCalls ?? [];
    if (calls.length > 0) {
      const utteranceSeq = turns.seq;
      for (const c of calls) {
        events.push({ t: t(), kind: "tool", text: `${c.name} ${JSON.stringify(c.args)}` });
        tools.push({ name: c.name ?? "", args: (c.args ?? {}) as Record<string, unknown> });
      }
      pendingTools = pendingTools.then(async () => {
        const fresh = (await store.get(sessionId))!;
        const responses = await runToolCalls(calls, {
          liveSessionId,
          utteranceSeq,
          cartVersion: () => fresh.cartVersion,
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
      // KIBO finished a reply (usually a question): the gate accepts a quieter answer for a few seconds.
      gate?.asked();
    }
  };

  live = await ai.live.connect({
    model: config.model,
    config: liveConnectConfig(config.system, config.tools, config.languageCode),
    callbacks: {
      onmessage,
      onerror: () => {},
      onclose: (ev) => {
        closed = true;
        quotaStop({ reason: ev?.reason, code: ev?.code }, "Live close");
      },
    },
  });
  await sleep(200);
  const holdSegs = ref.customer.turns.map((u) => [u.startMs - PAD_MS, u.endMs + PAD_MS] as [number, number]);
  const send = (k: number) => live!.sendRealtimeInput({ audio: { data: int16ToBase64(Int16Array.from(mix.subarray(k * FRAME, (k + 1) * FRAME), (s) => Math.round(Math.max(-1, Math.min(1, s)) * 0x7fff))), mimeType: "audio/pcm;rate=16000" } });
  t0 = performance.now();
  const n = Math.floor(mix.length / FRAME);
  let open = false;
  let nextUnsent = 0;
  let sent = 0;
  let dropped = 0;
  let ends = 0;
  for (let k = 0; k < n && !closed; k++) {
    const atMs = k * FRAME_MS;
    const wait = t0 + atMs - performance.now();
    if (wait > 0) await sleep(wait);
    let want: boolean;
    let from = k;
    if (STACK === "open") want = true;
    else if (STACK === "hold-oracle") want = holdSegs.some(([s, e]) => atMs >= s && atMs < e);
    else {
      want = gate!.push(10 * Math.log10(Math.max(1e-10, mix.subarray(k * FRAME, (k + 1) * FRAME).reduce((a, v) => a + v * v, 0) / FRAME)));
      if (want && !open) {
        const segs = gate!.segments();
        from = Math.max(nextUnsent, Math.floor(segs[segs.length - 1][0] / FRAME_MS));
      }
    }
    const muted = performance.now() < playEnd + MUTE_TAIL_MS;
    if (want) {
      // Frames held back since the segment's start go out at once (the gate reached back), then this one.
      for (let j = open ? k : from; j <= k; j++) {
        if (muted) dropped++;
        else {
          send(j);
          sent++;
        }
      }
      nextUnsent = k + 1;
      open = true;
    } else if (open) {
      if (STACK !== "open") {
        live.sendRealtimeInput({ audioStreamEnd: true });
        ends++;
      }
      open = false;
    }
  }
  if (open && STACK !== "open" && !closed) live.sendRealtimeInput({ audioStreamEnd: true });
  await sleep(1500);
  await pendingTools;
  closed = true;
  live.close();
  const end = (await store.get(sessionId))!;
  const outputs = events.filter((e) => e.kind === "audio" || e.kind === "tool").map((e) => ({ t: e.t, kind: e.kind as "audio" | "tool" }));
  const cart = end.cart.map((l) => ({ itemId: l.itemId, qty: l.qty, variant: l.variant, selections: l.selections }));
  const items = bystanderItemsAdded(tools, cart);
  const hero = sameOrder(end.cart, HERO_CART);
  const s = flowScore(ref.customer.turns, outputs);
  // Gate closes that fall inside a customer sentence (the cap or the hang-over cutting the customer off).
  const closesInsideTurns = (gate?.segments() ?? []).filter(([, e]) => ref.customer.turns.some((u) => e > u.startMs && e < u.endMs)).length;
  return { ok: isRightFlow({ heroCart: hero, status: end.status, bystanderItems: items }), heroCart: hero, status: end.status, bystanderItems: items, ...s, closesInsideTurns, cart, sent, dropped, ends, events, usage, gateSegments: gate?.segments() ?? null };
}

async function main() {
  const manifestRaw = readFileSync(join(BENCH, "manifest-flow.json"));
  const manifestSha = sha256(manifestRaw);
  const refs = JSON.parse(readFileSync(join(BENCH, "refs-flow.json"), "utf8")) as { cells: Record<string, string[]>; trials: Record<string, FlowRef> };
  const runs = Number(arg("runs", "6"));
  const cells = arg("cells", Object.keys(refs.cells).map((c) => c.slice(5)).join(",")).split(",");
  const log = join(BENCH, "logs", `flow-${NAME}.jsonl`);
  const rows = existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.manifestSha === manifestSha && !r.error) : [];
  const done = new Set(rows.map((r) => r.trial));
  const jobs = cells.flatMap((cell) => (refs.cells[`flow/${cell}`] ?? []).slice(0, runs).map((id, run) => ({ cell, id, run }))).filter((j) => !done.has(j.id));
  const limit = Number(arg("limit", String(jobs.length)));
  const todo = jobs.slice(0, limit);
  console.log(`flow ${NAME}: ${todo.length} sessions to run (${done.size} already in logs/flow-${NAME}.jsonl); ledger about ₩${capCheck("at start")}`);
  let next = 0;
  await Promise.all(
    Array.from({ length: Number(arg("conc", "3")) }, async () => {
      while (next < todo.length) {
        const j = todo[next++];
        capCheck("before a Live session");
        const stamp = gitStamp();
        if (stamp.dirty) {
          console.error(`src/, data/ or skills/ changed while running: stopped; tell kibo-59`);
          process.exit(2);
        }
        const ref = refs.trials[j.id];
        const base = { stack: NAME, gate: STACK, gateParams: GATE_PARAMS, files: FILES, instructions: INSTRUCTIONS && { file: INSTRUCTIONS.file, sha256: INSTRUCTIONS.sha256 }, manifestSha, ...stamp, cell: j.cell, trial: j.id, run: j.run, at: new Date().toISOString() };
        try {
          const mix = decodeWav(readFileSync(join(BENCH, "inputs", j.id, "mix.wav"))).x;
          const started = performance.now();
          const r = await one(ref, mix);
          appendFileSync(log, JSON.stringify({ ...base, sessionS: Math.round((performance.now() - started) / 100) / 10, ...r }) + "\n");
          console.log(`${j.cell} ${j.id}: ${r.ok ? "right" : "wrong"} cart ${r.heroCart ? "hero" : "other"} ${r.status} items [${r.bystanderItems.join(",")}] answered ${r.answered}/4 spurious ${r.spurious}`);
        } catch (e) {
          quotaStop(e, "Live session");
          appendFileSync(log, JSON.stringify({ ...base, error: e instanceof Error ? e.message.slice(0, 300) : "error" }) + "\n");
          console.log(`${j.cell} ${j.id}: error ${e instanceof Error ? e.message.slice(0, 120) : ""}`);
        }
      }
    }),
  );
  const all = readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.manifestSha === manifestSha && !r.error);
  const summary = cells.map((cell) => {
    const ids = new Set((refs.cells[`flow/${cell}`] ?? []).slice(0, runs));
    const rs = all.filter((r) => ids.has(r.trial));
    const right = rs.filter((r) => isRightFlow(r)).length;
    const items = rs.filter((r) => r.bystanderItems.length).length;
    // Reached paying by voice, without the review's tap (the field build runs CONFIRM_TAP_ONLY=1; kibo-59 11-27).
    const paying = rs.filter((r) => r.status === "paying").length;
    return { cell, n: rs.length, right, rightCi: wilson(right, rs.length), payingWithoutTap: paying, withBystanderItems: items, itemsCi: wilson(items, rs.length), heroCart: rs.filter((r) => r.heroCart).length, answeredMean: rs.length ? rs.reduce((a, r) => a + r.answered, 0) / rs.length : null, spuriousMean: rs.length ? rs.reduce((a, r) => a + r.spurious, 0) / rs.length : null };
  });
  console.log(`\nflow ${NAME} (manifest-flow ${manifestSha.slice(0, 12)}; log spikes/speaker-gate/bench/logs/flow-${NAME}.jsonl)`);
  for (const s of summary) console.log(`${s.cell.padEnd(14)} right ${s.right}/${s.n} [${s.rightCi.map((x) => x.toFixed(2)).join("-")}]  paying without tap ${s.payingWithoutTap}/${s.n}  bystander items ${s.withBystanderItems}/${s.n}  hero cart ${s.heroCart}/${s.n}  turns answered ${s.answeredMean?.toFixed(1) ?? "-"}/4  spurious ${s.spuriousMean?.toFixed(1) ?? "-"}`);
  writeFileSync(join(BENCH, "logs", `flow-${NAME}-summary.json`), JSON.stringify({ stack: NAME, gate: STACK, instructions: INSTRUCTIONS && { file: INSTRUCTIONS.file, sha256: INSTRUCTIONS.sha256 }, manifestSha, ...gitStamp(), runsPerCell: runs, cells: summary }, null, 1));
}

if (process.argv[1]?.endsWith("flow.ts")) main().catch((e) => {
  console.error("flow failed:", e instanceof Error ? e.message : "error");
  process.exit(1);
});
