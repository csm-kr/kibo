"use client";

import type { FunctionCall, FunctionResponse, LiveServerMessage } from "@google/genai";
import { useEffect, useState } from "react";
import type { AgentAction } from "@/lib/agent/actions";
import { offerTracker, type OfferTracker } from "@/lib/agent/offers";
import { aiLanguageField, ApiError, liveToken, sendCommand } from "@/lib/client/api";
import type { SpeechLanguage } from "@/lib/i18n/languages";
import { errorCopy } from "@/lib/i18n/errors";
import { pt } from "@/lib/i18n/phone";
import { bargeIn } from "@/lib/voice/bargeIn";
import { e2eFrame, e2eMarks, e2eOutput, frameRms } from "@/lib/voice/e2eMarks";
import { base64ToFloat32, downsampleTo16k, int16ToBase64 } from "@/lib/voice/pcm";
import { connectRelay, relayCloseOutcome, type LiveLink } from "@/lib/voice/relayLink";
import { runToolCalls } from "@/lib/voice/toolRunner";
import { initialTurns, noiseStep, raiseSeq, turnEvents, turnsReducer, type TurnEvent } from "@/lib/voice/turns";
import type { KioskData, Locale } from "@/types/menu";
import type { CartLine, DineOption, Session, SessionStatus } from "@/types/session";
import { dineNote } from "@/lib/voice/dineNote";
import { greeter, HELD_RESULT } from "@/lib/voice/greeting";

// The phone's Gemini Live connection (ADR-003, docs/ARCHITECTURE.md "Voice"): audio goes straight to Gemini with a
// one-use token, or through the Vertex relay when /api/live-token says so (ADR-012; the same Live messages, so one
// handler serves both); tool calls go to /api/command. Half-duplex, reconnect, then text. Audio, transcripts and
// tokens are never logged.

export type VoiceState = "off" | "connecting" | "listening" | "thinking" | "speaking" | "reconnecting" | "error";

export interface LiveVoiceOptions {
  sessionId: string | null;
  deviceToken: string | null;
  kiosk: KioskData;
  locale: Locale;
  /** What the AI speaks and hears, when the user chose a language the screens do not have (14-final:4). */
  language?: SpeechLanguage;
  /** Voice stops when the order is paid or expired. */
  status: SessionStatus | null;
  /** The cartVersion on the confirm card the user is looking at. */
  getCartVersion: () => number;
  /** What it heard, one finished utterance at a time (UX A5). */
  onUserText(text: string): void;
  /** What the AI said, one reply at a time; the only output when `voiceOutput` is off. */
  onAiText(text: string): void;
  /** Voice stopped for good; the screen switches to text and shows `reason`. */
  onFallback(reason: string): void;
  /** Two spoken turns in a row did nothing (UX "Noise"): suggest typing or the buttons. */
  onNoise(): void;
  voiceOutput: boolean;
  /** The last utteranceSeq used by typed or spoken turns, shared with the chat so the server sees one counter. */
  utterances: { current: number };
  /** The cart on the screen, so a reported remove or update can name its line. */
  getCart?: () => CartLine[];
  /** The latest session from the stream, so a learned kiosk's next tool call waits for the bridge (I-155). */
  getSession?: () => Session | null;
  /** /demo: each tool call as ids and a result code, for "What the AI did". */
  onAction?: (action: AgentAction) => void;
  /** The AI's first line, said when voice opens; null once anything was said, after the review starts, or off the phone. */
  greeting?: string | null;
}

const OUTPUT_RATE = 24000;
/** The mic stays shut this long after the AI voice ends, so the AI does not hear its own tail. */
const MUTE_TAIL_MS = 300;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
/** The SDK's connect waits for setupComplete and never settles if the socket closes first. */
const SETUP_TIMEOUT_MS = 10_000;
/** The relay checks the session and opens Vertex first, with its own 10 s limits; give it room to say why it failed. */
const RELAY_SETUP_TIMEOUT_MS = 15_000;
/** Where the person may talk over the AI (bargeIn.ts). Not on the order review: only a yes said after the AI finished
 *  (or a tap) confirms there, so the AI's own "say yes" can never come back through the mic as the person's answer. */
const BARGE_STATES = new Set<SessionStatus | null>(["connected", "ordering"]);

interface Run {
  ctx: AudioContext;
  stream: MediaStream | null;
  worklet: AudioWorkletNode | null;
  live: LiveLink | null;
  /** The current connection; callbacks of an older one see another id and do nothing. */
  liveSessionId: string;
  release: (() => void) | null;
  sources: Set<AudioBufferSourceNode>;
  playEnd: number;
  mutedUntil: number;
  /** Frames heard while the mic is shut, for a cut-in (bargeIn.ts). */
  barge: ReturnType<typeof bargeIn>;
  /** The person cut in: the rest of the running reply is not played. */
  dropReply: boolean;
  /** Reconnects since the last successful setup. */
  retries: number;
  deadline: number;
  timer: ReturnType<typeof setInterval> | null;
  /** Tool calls run one batch after another. */
  tools: Promise<void>;
  userText: string;
  aiText: string;
  stopped: boolean;
  /** For UX "Noise": the running response answered something the user said, and ran a tool. */
  respHeard: boolean;
  respTools: boolean;
  misses: number;
  /** The dine option the open session knows: pinned with its token, or told since. */
  toldDine: DineOption | null;
  /** Choice buttons offered for the current utterance, across tool call messages and reconnects (offers.ts). */
  offers: OfferTracker;
  /** The greeting, once per voice start (src/lib/voice/greeting.ts). */
  greeter: ReturnType<typeof greeter>;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One tab per phone holds Live (docs/SECURITY.md "Reliability"). Resolves to a release function, or null if taken. */
function holdLock(name: string): Promise<(() => void) | null> {
  if (!navigator.locks) return Promise.resolve(() => {});
  return new Promise((resolve) => {
    navigator.locks
      .request(name, { ifAvailable: true }, (lock) => {
        if (!lock) return resolve(null);
        return new Promise<void>((release) => resolve(() => release()));
      })
      .catch(() => resolve(() => {}));
  });
}

function createVoice(initial: LiveVoiceOptions, setState: (s: VoiceState) => void, setSecondsLeft: (n: number | null) => void) {
  let o = initial;
  let run: Run | null = null;
  // Survives reconnects and restarts, so utteranceSeq never goes back during this order.
  let turns = initialTurns();
  // Latency marks for the voice E2E (`?e2e=1` only); null otherwise.
  const marks = e2eMarks();

  function flushUser(r: Run) {
    const text = r.userText.trim();
    r.userText = "";
    if (text) o.onUserText(text);
  }

  function flushText(r: Run) {
    flushUser(r);
    const text = r.aiText.trim();
    r.aiText = "";
    if (text) o.onAiText(text);
  }

  function stopPlayback(r: Run) {
    for (const src of r.sources) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        // Not started yet or already stopped.
      }
    }
    r.sources.clear();
    r.playEnd = 0;
    r.mutedUntil = performance.now() + MUTE_TAIL_MS;
  }

  /** Frees everything the run holds; safe to call again for resources acquired after a stop. */
  function free(r: Run) {
    r.stopped = true;
    r.liveSessionId = "";
    const live = r.live;
    r.live = null;
    try {
      live?.close();
    } catch {
      // Already closed.
    }
    stopPlayback(r);
    if (r.worklet) {
      r.worklet.port.onmessage = null;
      r.worklet.disconnect();
      r.worklet = null;
    }
    r.stream?.getTracks().forEach((t) => t.stop());
    r.stream = null;
    if (r.ctx.state !== "closed") void r.ctx.close().catch(() => {});
    r.release?.();
    r.release = null;
    if (r.timer) clearInterval(r.timer);
    r.timer = null;
  }

  function end(r: Run, next: "off" | "error", reason?: string) {
    if (r.stopped) return;
    flushText(r);
    turns = turnsReducer(turns, { type: "responseEnd" });
    free(r);
    if (run === r) run = null;
    setSecondsLeft(null);
    setState(next);
    if (reason) o.onFallback(reason);
  }

  function failure(e: unknown): string {
    // This order's own voice is used up, not shared load (I-410).
    if (e instanceof ApiError && e.detail?.limit === "session") return pt("voiceTimeUp", o.locale);
    return failureFor(e instanceof ApiError ? e.code : null);
  }

  function failureFor(code: string | null): string {
    if (code === "RATE_LIMITED") return pt("voiceBusy", o.locale);
    if (code === "UPSTREAM") return errorCopy("UPSTREAM", o.locale);
    return pt("voiceFailed", o.locale);
  }

  function sendPcm(r: Run, frame: Float32Array) {
    const pcm = downsampleTo16k(frame, r.ctx.sampleRate);
    try {
      r.live?.sendRealtimeInput({ audio: { data: int16ToBase64(pcm), mimeType: "audio/pcm;rate=16000" } });
    } catch {
      // The socket is closing; onclose reconnects.
    }
  }

  function sendFrame(r: Run, frame: Float32Array) {
    if (!r.live) return;
    // Half-duplex: nothing goes up while the AI voice plays or just after, unless the person talks over it (owner
    // 10-18): then the AI stops at once and Live hears them from the start of their words.
    if (r.sources.size > 0 || performance.now() < r.mutedUntil) {
      // The voice E2E's fake mic loops its sentence; it sends one utterance only (e2eMarks.ts), so no cut-in there.
      if (marks || !BARGE_STATES.has(o.status) || !r.barge.push(frame, frameRms(frame))) return;
      r.dropReply = turns.responding;
      stopPlayback(r);
      r.mutedUntil = 0;
      setState("listening");
      for (const kept of r.barge.take()) sendPcm(r, kept);
      return;
    }
    r.barge.reset();
    if (marks && !e2eFrame(marks, frameRms(frame), performance.now())) return;
    sendPcm(r, frame);
  }

  function play(r: Run, b64: string) {
    const data = base64ToFloat32(b64);
    if (data.length === 0) return;
    // A 24 kHz buffer in a context at the device rate: the browser resamples on playback.
    const buf = r.ctx.createBuffer(1, data.length, OUTPUT_RATE);
    buf.copyToChannel(data, 0);
    const src = r.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(r.ctx.destination);
    const at = Math.max(r.ctx.currentTime, r.playEnd);
    src.start(at);
    r.playEnd = at + buf.duration;
    r.sources.add(src);
    setState("speaking");
    src.onended = () => {
      r.sources.delete(src);
      if (r.sources.size > 0) return;
      r.mutedUntil = performance.now() + MUTE_TAIL_MS;
      // A gap between audio chunks of one reply keeps "speaking"; turnComplete then moves to listening.
      if (!r.stopped && !turns.responding) setState("listening");
    };
  }

  function runTools(r: Run, id: string, calls: FunctionCall[]) {
    const { sessionId, deviceToken } = o;
    if (!sessionId || !deviceToken) return;
    // The seq of the response these calls belong to, taken before any await.
    const utteranceSeq = turns.seq;
    // The greeting's own response asked for something: nothing is run, and the model is told to wait for the user.
    if (r.greeter.holdsTools) {
      const held = calls.map((c) => ({ ...(c.id ? { id: c.id } : {}), name: c.name ?? "", response: HELD_RESULT }));
      r.tools = r.tools.then(() => {
        if (r.liveSessionId !== id || !r.live) return;
        try {
          r.live.sendToolResponse({ functionResponses: held });
        } catch {
          // The socket is closing; onclose reconnects.
        }
      });
      return;
    }
    setState("thinking");
    r.tools = r.tools.then(async () => {
      const responses = await runToolCalls(calls, {
        liveSessionId: id,
        utteranceSeq,
        cartVersion: () => o.getCartVersion(),
        kiosk: o.kiosk,
        locale: o.locale,
        send: (cmd) => sendCommand({ sessionId, token: deviceToken, ...cmd }),
        cart: () => o.getCart?.() ?? [],
        session: () => o.getSession?.() ?? null,
        onAction: (action) => o.onAction?.(action),
        offers: r.offers,
      });
      // After a reconnect the new instructions already hold the cart, so a lost answer loses nothing.
      if (r.liveSessionId !== id || !r.live) return;
      try {
        r.live.sendToolResponse({ functionResponses: responses as FunctionResponse[] });
      } catch {
        // The socket is closing; onclose reconnects.
      }
    });
  }

  /** Counts on from the shared counter and writes back, so typed and spoken turns never reuse a seq. */
  function countTurns(events: TurnEvent[]) {
    turns = events.reduce(turnsReducer, raiseSeq(turns, o.utterances.current));
    o.utterances.current = Math.max(o.utterances.current, turns.seq);
  }

  function onMessage(r: Run, id: string, m: LiveServerMessage) {
    const events = turnEvents(m);
    countTurns(events);
    r.greeter.onMessage(events);
    const sc = m.serverContent;
    if (marks) {
      const now = performance.now();
      if (m.toolCall?.functionCalls?.length) e2eOutput(marks, "tool", now);
      if (events.some((e) => e.type === "modelOutput")) e2eOutput(marks, "text", now);
      if (sc?.modelTurn?.parts?.some((p) => p.inlineData?.mimeType?.startsWith("audio/"))) e2eOutput(marks, "audio", now);
    }

    if (m.setupComplete) {
      r.retries = 0;
      setState("listening");
    }
    if (events.some((e) => e.type === "userSpeech")) r.respHeard = true;
    if (m.toolCall?.functionCalls?.length) r.respTools = true;
    if (sc?.turnComplete) {
      const n = noiseStep(r.misses, { heard: r.respHeard, tools: r.respTools });
      r.misses = n.misses;
      if (n.suggest) o.onNoise();
    }
    if (sc?.turnComplete || sc?.interrupted) {
      r.respHeard = false;
      r.respTools = false;
    }
    if (sc?.inputTranscription?.text) r.userText += sc.inputTranscription.text;
    if (events.some((e) => e.type === "modelOutput")) flushUser(r);
    if (sc?.outputTranscription?.text && !r.dropReply) r.aiText += sc.outputTranscription.text;
    if (sc?.interrupted) stopPlayback(r);
    if (o.voiceOutput && !r.dropReply) {
      for (const part of sc?.modelTurn?.parts ?? []) {
        if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio/")) play(r, part.inlineData.data);
      }
    }
    if (sc?.turnComplete || sc?.interrupted) {
      flushText(r);
      r.dropReply = false;
      if (r.sources.size === 0) setState("listening");
    }
    const calls = m.toolCall?.functionCalls ?? [];
    if (calls.length > 0) runTools(r, id, calls);
    if (m.goAway) void reconnect(r);
  }

  function startClock(r: Run, seconds: number) {
    r.deadline = Date.now() + seconds * 1000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((r.deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) end(r, "error", pt("voiceTimeUp", o.locale));
    };
    tick();
    r.timer = setInterval(tick, 1000);
  }

  /** Asks /api/live-token how to start and opens a connection. Token errors throw; a dropped socket goes to
   *  reconnect, which asks again, so a key that works again sends the phone back to the direct path. */
  async function connect(r: Run) {
    const { sessionId, deviceToken, locale } = o;
    if (!sessionId || !deviceToken) throw new Error("no session");
    // Only an AI-only language goes along, so a ko/en phone sends what the deployed relay already accepts.
    const aiLang = aiLanguageField({ locale, language: o.language });
    // The token pins the order as it is now; a dine option tapped after this is told to the session (tellDine).
    const dineAtToken = o.getSession?.()?.dineOption ?? null;
    const t = await liveToken({ sessionId, token: deviceToken, locale, ...aiLang });
    if (r.stopped) return;
    // The countdown runs from the first token of this start (the relay's arrives when it is ready); reconnects keep it.
    if (t.mode === "direct" && r.deadline === 0) startClock(r, t.voiceSeconds);
    const id = crypto.randomUUID();
    r.liveSessionId = id;
    const setupTimer = setTimeout(
      () => {
        if (r.liveSessionId === id && !r.live) void reconnect(r);
      },
      t.mode === "relay" ? RELAY_SETUP_TIMEOUT_MS : SETUP_TIMEOUT_MS,
    );
    const onmessage = (m: LiveServerMessage) => {
      if (r.liveSessionId === id) onMessage(r, id, m);
    };
    const opened = (live: LiveLink) => {
      clearTimeout(setupTimer);
      if (r.liveSessionId !== id) return live.close();
      r.live = live;
      r.toldDine = dineAtToken;
      tellDine(r);
      greet(r);
    };

    if (t.mode === "relay") {
      // The relay holds the instructions (with the current cart, marked applied) and tools; the device token goes
      // in its first message.
      void connectRelay(t.url, { sessionId, deviceToken, locale, ...aiLang }, {
        onready: (info) => {
          if (r.liveSessionId === id && r.deadline === 0) startClock(r, info.voiceSeconds);
        },
        onmessage,
        onclose: (code) => {
          clearTimeout(setupTimer);
          if (r.liveSessionId !== id) return;
          const outcome = relayCloseOutcome(code);
          if (outcome === "retry") return void reconnect(r);
          end(r, "error", outcome === "timeUp" ? pt("voiceTimeUp", o.locale) : failureFor(outcome));
        },
      }).then(opened);
      return;
    }

    const { GoogleGenAI } = await import("@google/genai");
    // Stopped or replaced while the SDK loaded.
    if (r.liveSessionId !== id) return clearTimeout(setupTimer);
    // Model, instructions (with the current cart, marked applied) and tools are pinned in the token.
    const ai = new GoogleGenAI({ apiKey: t.token, httpOptions: { apiVersion: "v1alpha" } });
    ai.live
      .connect({
        model: t.model,
        callbacks: {
          onmessage,
          onclose: () => {
            clearTimeout(setupTimer);
            if (r.liveSessionId === id) void reconnect(r);
          },
          // onclose follows every error.
          onerror: () => {},
        },
      })
      .then(opened)
      .catch(() => {
        clearTimeout(setupTimer);
        if (r.liveSessionId === id) void reconnect(r);
      });
  }

  async function reconnect(r: Run) {
    if (r.stopped) return;
    flushText(r);
    stopPlayback(r);
    r.dropReply = false;
    turns = turnsReducer(turns, { type: "responseEnd" });
    const old = r.live;
    r.live = null;
    r.liveSessionId = "";
    try {
      old?.close();
    } catch {
      // Already closed.
    }
    if (r.retries >= MAX_RETRIES) return end(r, "error", pt("voiceFailed", o.locale));
    r.retries++;
    setState("reconnecting");
    await wait(RETRY_DELAY_MS);
    if (r.stopped) return;
    try {
      await connect(r);
    } catch (e) {
      // Only a lost connection is worth another try; a limit or a refusal will not change.
      const retry = !(e instanceof ApiError) || e.code === "NETWORK" || e.code === "INTERNAL";
      if (retry) return reconnect(r);
      end(r, "error", failure(e));
    }
  }

  async function start() {
    const { sessionId, deviceToken } = o;
    if (run || !sessionId || !deviceToken) return;
    // Still inside the tap: iOS plays sound only from an AudioContext made or resumed in a user gesture.
    const ctx = new AudioContext();
    void ctx.resume();
    const r: Run = {
      ctx,
      stream: null,
      worklet: null,
      live: null,
      liveSessionId: "",
      release: null,
      sources: new Set(),
      playEnd: 0,
      mutedUntil: 0,
      barge: bargeIn(),
      dropReply: false,
      retries: 0,
      deadline: 0,
      timer: null,
      tools: Promise.resolve(),
      userText: "",
      aiText: "",
      stopped: false,
      respHeard: false,
      respTools: false,
      misses: 0,
      toldDine: null,
      offers: offerTracker(),
      greeter: greeter(),
    };
    run = r;
    setState("connecting");

    r.release = await holdLock(`kibo-live-${sessionId}`);
    if (r.stopped) return free(r);
    if (!r.release) return end(r, "error", pt("voiceOtherTab", o.locale));

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("no microphone");
      r.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      if (r.stopped) return free(r);
      await ctx.audioWorklet.addModule("/audio/pcm-recorder-worklet.js");
      if (r.stopped) return free(r);
      const node = new AudioWorkletNode(ctx, "pcm-recorder");
      node.port.onmessage = (e: MessageEvent<Float32Array>) => sendFrame(r, e.data);
      ctx.createMediaStreamSource(r.stream).connect(node);
      // The node outputs silence; connecting it keeps the browser pulling audio through it.
      node.connect(ctx.destination);
      r.worklet = node;
    } catch {
      return end(r, "error", pt("voiceNoMic", o.locale));
    }

    try {
      await connect(r);
    } catch (e) {
      end(r, "error", failure(e));
    }
  }

  /**
   * A dine option set by a tap after the token was issued (P1's mic, then P2's eat-in) goes to the open session as
   * context, without ending a turn, so the model never asks it again (14-final:4). Not a user turn: no utteranceSeq.
   */
  function tellDine(r: Run) {
    const dine = o.getSession?.()?.dineOption ?? null;
    if (!r.live || r.stopped || dine === null || dine === r.toldDine) return;
    try {
      r.live.sendClientContent({ turns: [{ role: "user", parts: [{ text: dineNote(dine) }] }], turnComplete: false });
      r.toldDine = dine;
    } catch {
      // A closing socket: the next connection's token carries the dine option.
    }
  }

  /**
   * The AI speaks first (owner 10-17): the phone's greeting as one text turn when the first connection of this voice
   * start opens. Not counted as an utterance (no countTurns), so it can never be the "yes" that confirms.
   */
  function greet(r: Run) {
    const turn = r.greeter.onConnected(o.greeting ?? null, o.status);
    if (!turn || !r.live) return;
    try {
      r.live.sendClientContent(turn);
    } catch {
      // A closing socket: nothing to greet.
    }
  }

  /** A tapped answer (a choice button) as one user turn on the open connection; false when there is none. */
  function sendText(text: string): boolean {
    const r = run;
    if (!r?.live || r.stopped) return false;
    try {
      r.live.sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete: true });
    } catch {
      return false;
    }
    flushUser(r);
    countTurns([{ type: "userSpeech" }]);
    r.respHeard = true;
    return true;
  }

  return {
    start,
    sendText,
    stop() {
      if (run) end(run, "off");
    },
    update(next: LiveVoiceOptions) {
      if (o.voiceOutput && !next.voiceOutput && run) stopPlayback(run);
      o = next;
      if (run) tellDine(run);
    },
  };
}

export function useLiveVoice(opts: LiveVoiceOptions): {
  state: VoiceState;
  /** Call from a tap: iOS needs a user gesture to start audio. */
  start(): Promise<void>;
  stop(): void;
  /** A tapped answer as one user turn on the open connection; false when there is none (send it as text). */
  sendText(text: string): boolean;
  secondsLeft: number | null;
} {
  const [state, setState] = useState<VoiceState>("off");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [voice] = useState(() => createVoice(opts, setState, setSecondsLeft));

  useEffect(() => {
    voice.update(opts);
  });

  // [Try again] unmounts the panel, which stops voice too.
  useEffect(() => () => voice.stop(), [voice]);

  useEffect(() => {
    if (opts.status === "paid" || opts.status === "expired") voice.stop();
  }, [opts.status, voice]);

  return { state, start: voice.start, stop: voice.stop, sendText: voice.sendText, secondsLeft };
}
