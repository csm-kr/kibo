// Cost per order (docs/TESTING.md "Measurements"): the MALO hero order as one conversation of 4 user turns
// (the order, both fries large, no dessert, "I'll pay"), 3 times by text through runChat (as POST /api/chat) and
// 3 times by voice on Gemini Live, and the tokens Gemini reports for each. Memory store, no network to our routes.
// The evidence file holds model ids, counts and timings only: no utterances, replies, instructions or key.
// Prices are never read here (R-001): a run keeps the `prices` already in the evidence file (copied by hand from the
// official pricing page, with its URL and date) and re-multiplies them with the new tokens (scripts/cost.ts).
// Run with `npm run measure:cost` (GEMINI_API_KEY from .env; the text agent uses its usual backend).

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI, type FunctionResponse, type LiveServerMessage, type ModalityTokenCount, type Session as LiveSession } from "@google/genai";
import { getKiosk } from "@/lib/adapters/catalog";
import { runChat } from "@/lib/agent/chat";
import { liveConfig, liveConnectConfig } from "@/lib/agent/live";
import { geminiClient, textBackendSetting, tokenUsage, type ModelClient, type TextBackend, type TokenUsage } from "@/lib/agent/model";
import { sameOrder } from "@/lib/demo/compare";
import { MemoryUsageStore } from "@/lib/limits/usage";
import { chatReducer, historyFor, initialChat } from "@/lib/phone/chat";
import { createSession, runCommand } from "@/lib/session/service";
import { MemoryStore } from "@/lib/store/memory";
import { downsampleTo16k, int16ToBase64 } from "@/lib/voice/pcm";
import { runToolCalls } from "@/lib/voice/toolRunner";
import type { SessionStatus } from "@/types/session";
import { costPerOrder, type Prices } from "./cost";
import { ttsPcm } from "./wav";

const ROOT = process.cwd();
const RUNS = 3;
const KIOSK = "malo";
const kiosk = getKiosk(KIOSK);
// 14:00 KST, like the eval: every hero item is on sale.
const CLOCK = Date.parse("2026-10-13T05:00:00Z");

// The same four turns for both modes. Voice speaks the first two (e2e/fixtures, Gemini TTS, no real person) and
// types the last two into the open Live session, as the phone sends a typed line there (ARCHITECTURE "Voice").
const ORDER = "Two cheeseburger sets. One without pickles; drinks zero cola and cider.";
const FRIES = "Make both fries large.";
const NO_DESSERT = "No, thanks.";
const PAY = "That's all. I'll pay.";
const TEXT_TURNS = [ORDER, FRIES, NO_DESSERT, PAY];
const VOICE_TURNS: ({ audio: string } | { text: string })[] = [
  { audio: "hero-en.wav" },
  { audio: "fries-en.wav" },
  { text: NO_DESSERT },
  { text: PAY },
];

const FRAME_MS = 40;
const TRAILING_SILENCE_MS = 1500;
const TURN_TIMEOUT_MS = 45_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sum(us: TokenUsage[]): TokenUsage {
  return us.reduce((a, u) => ({
    prompt: a.prompt + u.prompt,
    cached: a.cached + u.cached,
    candidates: a.candidates + u.candidates,
    thoughts: a.thoughts + u.thoughts,
    total: a.total + u.total,
  }), { prompt: 0, cached: 0, candidates: 0, thoughts: 0, total: 0 });
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** A fresh demo session with the dine option tapped on the phone (P2), so checkout does not ask for it. */
async function newOrder() {
  const store = new MemoryStore();
  const started = Date.now();
  const now = () => CLOCK + (Date.now() - started);
  const { sessionId, deviceToken } = await createSession(store, { kioskId: KIOSK, demo: true }, now());
  await runCommand(
    store,
    { body: { sessionId, commandId: randomUUID(), type: "setDineOption", args: { option: "eat_in" }, source: "button" }, bearer: deviceToken! },
    now(),
  );
  return { store, now, sessionId, bearer: deviceToken! };
}

async function outcome(store: MemoryStore, sessionId: string): Promise<{ status: SessionStatus; heroCart: boolean }> {
  const s = (await store.get(sessionId))!;
  return { status: s.status, heroCart: sameOrder(s.cart) };
}

// ---- Text ----

interface TextCall extends TokenUsage {
  turn: number;
  backend: TextBackend | null;
}

async function textRun() {
  const { store, now, sessionId, bearer } = await newOrder();
  const usage = new MemoryUsageStore();
  const calls: TextCall[] = [];
  const commands: string[] = [];
  let chat = initialChat;
  const t0 = Date.now();
  for (const [turn, message] of TEXT_TURNS.entries()) {
    const session = (await store.get(sessionId))!;
    const history = historyFor(chat.messages);
    chat = chatReducer(chat, { type: "send", text: message });
    const inner = geminiClient();
    const model: ModelClient = {
      async generate(req) {
        const out = await inner.generate(req);
        if (!out.usage) throw new Error("usageMetadata missing from a text call");
        calls.push({ turn: turn + 1, backend: out.backend ?? null, ...out.usage });
        return out;
      },
    };
    const res = await runChat(
      { store, model, usage, now },
      {
        sessionId,
        chatRequestId: randomUUID(),
        message,
        history,
        utteranceSeq: chat.utteranceSeq,
        cartVersion: session.status === "confirming" ? session.cartVersion : undefined,
        locale: "en",
        bearer,
      },
    );
    chat = chatReducer(chat, { type: "reply", text: res.reply });
    commands.push(...res.actions.map((a) => `${a.tool}:${a.code}`));
  }
  return { durationMs: Date.now() - t0, ...(await outcome(store, sessionId)), commands, calls, order: sum(calls) };
}

// ---- Voice ----

interface VoiceUsage extends TokenUsage {
  turn: number;
  /** Per modality (AUDIO, TEXT), as Gemini reports them. */
  promptByModality: Record<string, number>;
  responseByModality: Record<string, number>;
}

function byModality(details: ModalityTokenCount[] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of details ?? []) if (d.modality) out[d.modality] = (out[d.modality] ?? 0) + (d.tokenCount ?? 0);
  return out;
}

/** 16 kHz PCM frames of 40 ms from a 48 kHz mono fixture. */
function frames(file: string): string[] {
  const pcm = ttsPcm(readFileSync(join(ROOT, "e2e/fixtures", file)));
  const rate = 48000;
  const per = (rate * FRAME_MS) / 1000;
  const out: string[] = [];
  for (let at = 0; at + per <= pcm.length; at += per) {
    const f = Float32Array.from(pcm.subarray(at, at + per), (s) => s / 0x8000);
    out.push(int16ToBase64(downsampleTo16k(f, rate)));
  }
  const silence = int16ToBase64(new Int16Array((16000 * FRAME_MS) / 1000));
  for (let i = 0; i < TRAILING_SILENCE_MS / FRAME_MS; i++) out.push(silence);
  return out;
}

async function voiceRun() {
  const { store, now, sessionId, bearer } = await newOrder();
  const session = (await store.get(sessionId))!;
  const config = liveConfig(kiosk, { cart: session.cart, status: session.status, dineOption: session.dineOption, locale: "en" });
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: "v1alpha" } });
  const liveSessionId = randomUUID();
  const usages: VoiceUsage[] = [];
  let turn = 0;
  let pendingTools = Promise.resolve();
  /** The model generation now running made a tool call, so the user's turn goes on with the reply after it. */
  let genCalledTools = false;
  let interruptions = 0;
  let onTurnDone: (() => void) | null = null;
  let live: LiveSession | null = null;
  const commands: string[] = [];

  // Seen in a traced run: each generation's usage comes with its turnComplete, and the spoken reply's turnComplete
  // arrives only about when its audio would finish playing. Sending the next turn earlier interrupts the reply, so
  // a turn ends at the first turnComplete of a generation without a tool call, like the half-duplex phone waits.
  const onmessage = (m: LiveServerMessage) => {
    const u = tokenUsage(m.usageMetadata);
    if (u) {
      usages.push({
        turn,
        ...u,
        promptByModality: byModality(m.usageMetadata?.promptTokensDetails),
        responseByModality: byModality(m.usageMetadata?.responseTokensDetails),
      });
    }
    const calls = m.toolCall?.functionCalls ?? [];
    if (calls.length > 0) {
      genCalledTools = true;
      const seq = turn;
      pendingTools = pendingTools.then(async () => {
        const responses = await runToolCalls(calls, {
          liveSessionId,
          utteranceSeq: seq,
          cartVersion: () => 0,
          kiosk,
          locale: "en",
          send: async (cmd) => runCommand(store, { body: { sessionId, ...cmd }, bearer }, now()),
          onAction: (a) => commands.push(`${a.tool}:${a.code}`),
        });
        live?.sendToolResponse({ functionResponses: responses as FunctionResponse[] });
      });
    }
    if (m.serverContent?.interrupted) interruptions++;
    if (m.serverContent?.turnComplete) {
      if (genCalledTools) genCalledTools = false;
      else void pendingTools.then(() => onTurnDone?.());
    }
  };

  const t0 = Date.now();
  live = await ai.live.connect({
    model: config.model,
    config: liveConnectConfig(config.system, config.tools, config.languageCode),
    callbacks: { onmessage, onerror: () => {}, onclose: () => onClosed?.() },
  });
  let onClosed: (() => void) | null = null;
  try {
    for (const step of VOICE_TURNS) {
      turn++;
      let timer: NodeJS.Timeout | undefined;
      const done = new Promise<boolean>((resolve) => {
        onTurnDone = () => resolve(true);
        onClosed = () => resolve(false);
        timer = setTimeout(() => resolve(false), TURN_TIMEOUT_MS);
      });
      if ("audio" in step) {
        for (const data of frames(step.audio)) {
          live.sendRealtimeInput({ audio: { data, mimeType: "audio/pcm;rate=16000" } });
          await sleep(FRAME_MS);
        }
      } else {
        live.sendClientContent({ turns: [{ role: "user", parts: [{ text: step.text }] }], turnComplete: true });
      }
      const finished = await done;
      clearTimeout(timer);
      onTurnDone = null;
      if (!finished) return { failedTurn: turn, usageMessages: usages.length, commands };
    }
  } finally {
    onClosed = null;
    live.close();
  }
  return {
    durationMs: Date.now() - t0,
    ...(await outcome(store, sessionId)),
    commands,
    interruptions,
    usageMessages: usages,
    order: sum(usages),
  };
}

// ---- Main ----

type Totals = { order: TokenUsage };

function medians(runs: Totals[]) {
  return {
    prompt: median(runs.map((r) => r.order.prompt)),
    cached: median(runs.map((r) => r.order.cached)),
    candidates: median(runs.map((r) => r.order.candidates)),
    thoughts: median(runs.map((r) => r.order.thoughts)),
    total: median(runs.map((r) => r.order.total)),
  };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set (.env).");
    process.exit(1);
  }
  const date = new Date().toISOString();

  const text = [];
  for (let i = 0; i < RUNS; i++) {
    const r = await textRun();
    console.log(`text ${i + 1}: ${r.status}, hero cart ${r.heroCart}, ${r.calls.length} calls, ${r.order.total} tokens`);
    text.push(r);
  }
  // A Live session sometimes never finishes a turn; such an attempt is kept as a failure and another one runs.
  const voice = [];
  const voiceFailures = [];
  for (let attempt = 1; voice.length < RUNS && attempt <= 2 * RUNS; attempt++) {
    const r = await voiceRun();
    if ("failedTurn" in r) {
      console.log(`voice attempt ${attempt}: turn ${r.failedTurn} did not finish`);
      voiceFailures.push({ attempt, ...r });
      continue;
    }
    console.log(`voice attempt ${attempt}: ${r.status}, hero cart ${r.heroCart}, ${r.usageMessages.length} usage messages, ${r.order.total} tokens`);
    voice.push({ attempt, ...r });
  }
  if (voice.length < RUNS) throw new Error(`only ${voice.length} of ${RUNS} voice runs finished`);

  const evidencePath = join(ROOT, "evidence/cost-per-order.json");
  const previous = JSON.parse(readFileSync(evidencePath, "utf8"));
  const prices: Prices = previous.prices;

  const out = {
    about:
      "Gemini tokens for one MALO hero order (scripts/measure-cost.ts, `npm run measure:cost`): 4 user turns (the order, both fries " +
      "large, no dessert, I'll pay), ending at the confirm card; payment needs no model call. Text: runChat as POST /api/chat, " +
      "tokens from usageMetadata of every generateContent call, summed per order. Voice: one Gemini Live session with the " +
      "config the ephemeral token pins, connected from Node with the API key; turns 1-2 spoken by the synthetic TTS fixtures " +
      "hero-en.wav and fries-en.wav (e2e/fixtures), turns 3-4 typed into the same session; tokens from every usageMetadata " +
      "message (one per model generation, sent with its turnComplete), summed per order. Medians per field are taken " +
      "separately, so they need not add up. `cached` is the part of `prompt` served from the implicit cache. Live's " +
      "totalTokenCount leaves out thoughtsTokenCount (seen in every message), so bill thoughts as output on top of it. " +
      "Memory store, dine option tapped first. Counts only: no utterances, replies or instructions.",
    date,
    kioskId: KIOSK,
    runs: RUNS,
    text: {
      model: process.env.GEMINI_TEXT_MODEL ?? "gemini-3.8-flash",
      backendSetting: textBackendSetting(),
      thinkingLevel: process.env.GEMINI_TEXT_THINKING ?? "low",
      medianPerOrder: medians(text),
      runs: text,
    },
    voice: {
      model: liveConfig(kiosk, { cart: [], status: "ordering", dineOption: "eat_in", locale: "en" }).model,
      usageExposed: voice.some((r) => r.usageMessages.length > 0),
      // Unverified whether each Live usage message counts one model turn (so they add up) or the session so far.
      summedOver: "every usageMetadata message of the session",
      medianPerOrder: medians(voice),
      medianDurationMs: median(voice.map((r) => r.durationMs)),
      runs: voice,
      failedAttempts: voiceFailures,
    },
    costUsdPerOrder: { about: previous.costUsdPerOrder.about, ...costPerOrder({ prices, text: { runs: text }, voice: { runs: voice } }) },
    prices,
  };
  writeFileSync(evidencePath, JSON.stringify(out, null, 2) + "\n");
  console.log("Wrote evidence/cost-per-order.json");
}

main().catch((e) => {
  // The error name and message only; an SDK error may echo request data, so no body or stack.
  console.error("measure-cost failed:", e instanceof Error ? `${e.name}: ${e.message.slice(0, 200)}` : typeof e);
  process.exit(1);
});
