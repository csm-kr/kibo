"use client";

import type { FunctionCall, FunctionResponse, LiveServerMessage, Session as LiveSession } from "@google/genai";
import { useEffect, useState } from "react";
import { ApiError, liveToken, sendCommand } from "@/lib/client/api";
import { errorCopy } from "@/lib/i18n/errors";
import { pt } from "@/lib/i18n/phone";
import { base64ToFloat32, downsampleTo16k, int16ToBase64 } from "@/lib/voice/pcm";
import { runToolCalls } from "@/lib/voice/toolRunner";
import { initialTurns, noiseStep, raiseSeq, turnEvents, turnsReducer, type TurnEvent } from "@/lib/voice/turns";
import type { KioskData, Locale } from "@/types/menu";
import type { SessionStatus } from "@/types/session";

// The phone's Gemini Live connection (ADR-003, docs/ARCHITECTURE.md "Voice"): audio goes straight to Gemini with a
// one-use token; tool calls go to /api/command. Half-duplex, reconnect, then text. Audio, transcripts and tokens
// are never logged.

export type VoiceState = "off" | "connecting" | "listening" | "thinking" | "speaking" | "reconnecting" | "error";

export interface LiveVoiceOptions {
  sessionId: string | null;
  deviceToken: string | null;
  kiosk: KioskData;
  locale: Locale;
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
}

const OUTPUT_RATE = 24000;
/** The mic stays shut this long after the AI voice ends, so the AI does not hear its own tail. */
const MUTE_TAIL_MS = 300;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
/** The SDK's connect waits for setupComplete and never settles if the socket closes first. */
const SETUP_TIMEOUT_MS = 10_000;

interface Run {
  ctx: AudioContext;
  stream: MediaStream | null;
  worklet: AudioWorkletNode | null;
  live: LiveSession | null;
  /** The current connection; callbacks of an older one see another id and do nothing. */
  liveSessionId: string;
  release: (() => void) | null;
  sources: Set<AudioBufferSourceNode>;
  playEnd: number;
  mutedUntil: number;
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
    if (e instanceof ApiError && e.code === "RATE_LIMITED") return pt("voiceBusy", o.locale);
    if (e instanceof ApiError && e.code === "UPSTREAM") return errorCopy("UPSTREAM", o.locale);
    return pt("voiceFailed", o.locale);
  }

  function sendFrame(r: Run, frame: Float32Array) {
    // Half-duplex: nothing goes up while the AI voice plays or just after.
    if (!r.live || r.sources.size > 0 || performance.now() < r.mutedUntil) return;
    const pcm = downsampleTo16k(frame, r.ctx.sampleRate);
    try {
      r.live.sendRealtimeInput({ audio: { data: int16ToBase64(pcm), mimeType: "audio/pcm;rate=16000" } });
    } catch {
      // The socket is closing; onclose reconnects.
    }
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
    setState("thinking");
    r.tools = r.tools.then(async () => {
      const responses = await runToolCalls(calls, {
        liveSessionId: id,
        utteranceSeq,
        cartVersion: () => o.getCartVersion(),
        kiosk: o.kiosk,
        locale: o.locale,
        send: (cmd) => sendCommand({ sessionId, token: deviceToken, ...cmd }),
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
    const sc = m.serverContent;

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
    if (sc?.outputTranscription?.text) r.aiText += sc.outputTranscription.text;
    if (sc?.interrupted) stopPlayback(r);
    if (o.voiceOutput) {
      for (const part of sc?.modelTurn?.parts ?? []) {
        if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio/")) play(r, part.inlineData.data);
      }
    }
    if (sc?.turnComplete || sc?.interrupted) {
      flushText(r);
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

  /** Fetches a token and opens a connection. Token errors throw; a dropped socket goes to reconnect. */
  async function connect(r: Run) {
    const { sessionId, deviceToken, locale } = o;
    if (!sessionId || !deviceToken) throw new Error("no session");
    const t = await liveToken({ sessionId, token: deviceToken, locale });
    if (r.stopped) return;
    // The countdown runs from the first token of this start; reconnects keep it.
    if (r.deadline === 0) startClock(r, t.voiceSeconds);
    const { GoogleGenAI } = await import("@google/genai");
    if (r.stopped) return;
    const id = crypto.randomUUID();
    r.liveSessionId = id;
    // Model, instructions (with the current cart, marked applied) and tools are pinned in the token.
    const ai = new GoogleGenAI({ apiKey: t.token, httpOptions: { apiVersion: "v1alpha" } });
    const setupTimer = setTimeout(() => {
      if (r.liveSessionId === id && !r.live) void reconnect(r);
    }, SETUP_TIMEOUT_MS);
    ai.live
      .connect({
        model: t.model,
        callbacks: {
          onmessage: (m) => {
            if (r.liveSessionId === id) onMessage(r, id, m);
          },
          onclose: () => {
            clearTimeout(setupTimer);
            if (r.liveSessionId === id) void reconnect(r);
          },
          // onclose follows every error.
          onerror: () => {},
        },
      })
      .then((live) => {
        clearTimeout(setupTimer);
        if (r.liveSessionId === id) r.live = live;
        else live.close();
      })
      .catch(() => {
        clearTimeout(setupTimer);
        if (r.liveSessionId === id) void reconnect(r);
      });
  }

  async function reconnect(r: Run) {
    if (r.stopped) return;
    flushText(r);
    stopPlayback(r);
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
