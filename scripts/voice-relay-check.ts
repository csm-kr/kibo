// npm run voice:relay-check: one real check of the kibo-voice relay (12-phone-app:8), cost about one short Live turn.
// 1. The esbuild bundle (voice-relay/dist/server.cjs) starts and answers /healthz.
// 2. The relay runs in this process with the memory store and real Vertex AI Live (gcloud application default
//    credentials, VOICE_VERTEX_LOCATION or us-central1); a /demo session sends one text turn through it.
// Prints timings and counts only: no audio, no transcript, no token.
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { createSession } from "../src/lib/session/service";
import { getStore } from "../src/lib/store";
import { startRelay } from "../voice-relay/server";

process.env.STORE = "memory";
const TURN_TIMEOUT_MS = 30_000;
const BUNDLE_PORT = 3311;

async function bundleHealth(): Promise<boolean> {
  const child = spawn(process.execPath, ["voice-relay/dist/server.cjs"], {
    env: { ...process.env, PORT: String(BUNDLE_PORT), STORE: "memory" },
    stdio: "ignore",
  });
  try {
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const res = await fetch(`http://127.0.0.1:${BUNDLE_PORT}/healthz`).catch(() => null);
      if (res?.ok) return ((await res.json()) as { ok?: boolean }).ok === true;
    }
    return false;
  } finally {
    child.kill();
  }
}

interface TurnResult {
  closeCode: number | null;
  openMs: number | null;
  relayReadyMs: number | null;
  setupMs: number | null;
  firstAudioMs: number | null;
  turnCompleteMs: number | null;
  audioChunks: number;
  aiTranscript: boolean;
  toolCalls: string[];
  totalTokens: number | null;
}

async function oneTurn(port: number): Promise<TurnResult> {
  const s = await createSession(getStore(), { kioskId: "malo", demo: true }, Date.now());
  const r: TurnResult = {
    closeCode: null,
    openMs: null,
    relayReadyMs: null,
    setupMs: null,
    firstAudioMs: null,
    turnCompleteMs: null,
    audioChunks: 0,
    aiTranscript: false,
    toolCalls: [],
    totalTokens: null,
  };
  const t0 = performance.now();
  let sentAt = 0;
  const since = (t: number) => Math.round(performance.now() - t);
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  return new Promise((resolve) => {
    const timer = setTimeout(() => ws.close(), TURN_TIMEOUT_MS);
    ws.on("open", () => {
      r.openMs = since(t0);
      ws.send(JSON.stringify({ sessionId: s.sessionId, deviceToken: s.deviceToken, locale: "en" }));
    });
    ws.on("message", (data) => {
      const m = JSON.parse(data.toString());
      if (m.relay) r.relayReadyMs = since(t0);
      if (m.setupComplete) {
        r.setupMs = since(t0);
        sentAt = performance.now();
        ws.send(
          JSON.stringify({
            clientContent: { turns: [{ role: "user", parts: [{ text: "Hello. Do you have desserts? One short sentence, please." }] }], turnComplete: true },
          }),
        );
      }
      for (const part of m.serverContent?.modelTurn?.parts ?? []) {
        if (part.inlineData?.mimeType?.startsWith("audio/")) {
          r.audioChunks++;
          r.firstAudioMs ??= since(sentAt);
        }
      }
      if (m.serverContent?.outputTranscription?.text) r.aiTranscript = true;
      if (m.usageMetadata?.totalTokenCount) r.totalTokens = m.usageMetadata.totalTokenCount;
      const calls = (m.toolCall?.functionCalls ?? []) as { id?: string; name: string }[];
      if (calls.length > 0) {
        r.toolCalls.push(...calls.map((c) => c.name));
        ws.send(JSON.stringify({ toolResponse: { functionResponses: calls.map((c) => ({ id: c.id, name: c.name, response: { ok: true } })) } }));
      }
      if (m.serverContent?.turnComplete && r.turnCompleteMs === null) {
        r.turnCompleteMs = since(sentAt);
        // usageMetadata may follow in its own message.
        setTimeout(() => ws.close(), 500);
      }
    });
    ws.on("close", (code) => {
      clearTimeout(timer);
      r.closeCode = code;
      resolve(r);
    });
    ws.on("error", () => {});
  });
}

async function main() {
  const health = await bundleHealth();
  const relay = await startRelay({ port: 0 });
  let turn: TurnResult;
  try {
    turn = await oneTurn(relay.port);
  } finally {
    await relay.close();
  }
  const ok = health && turn.setupMs !== null && turn.audioChunks > 0 && turn.turnCompleteMs !== null;
  console.log(
    JSON.stringify(
      {
        at: new Date().toISOString(),
        location: process.env.VOICE_VERTEX_LOCATION || "us-central1",
        model: process.env.GEMINI_LIVE_MODEL ?? "gemini-3.8-live",
        bundleHealth: health,
        ...turn,
        ok,
      },
      null,
      2,
    ),
  );
  process.exit(ok ? 0 : 1);
}

void main();
