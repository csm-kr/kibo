import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { resetLimits } from "@/lib/limits/ip";
import { createSession } from "@/lib/session/service";
import { getStore } from "@/lib/store";
import type { LiveUpstream, OpenLive } from "./relay";
import { startRelay } from "./server";

// The HTTP and WebSocket wiring, with a fake Vertex session; the relay logic is in relay.test.ts.

let stop: (() => Promise<void>) | null = null;
afterEach(async () => {
  await stop?.();
  stop = null;
  resetLimits();
});

const sent: [string, unknown][] = [];
const fakeLive: OpenLive = async ({ onMessage }) => {
  onMessage({ setupComplete: {} });
  const up: LiveUpstream = {
    sendRealtimeInput: (p) => sent.push(["realtimeInput", p]),
    sendClientContent: (p) => sent.push(["clientContent", p]),
    sendToolResponse: (p) => sent.push(["toolResponse", p]),
    close: () => sent.push(["close", null]),
  };
  return up;
};

async function relay() {
  const r = await startRelay({ port: 0, openLive: fakeLive });
  stop = r.close;
  return `127.0.0.1:${r.port}`;
}

function messages(ws: WebSocket, n: number): Promise<unknown[]> {
  const got: unknown[] = [];
  return new Promise((resolve, reject) => {
    ws.on("message", (d) => {
      got.push(JSON.parse(d.toString()));
      if (got.length === n) resolve(got);
    });
    ws.on("close", (code) => reject(new Error(`closed ${code}`)));
  });
}

describe("kibo-voice server", () => {
  it("GET /health answers ok; other paths 404", async () => {
    const host = await relay();
    const health = await fetch(`http://${host}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, service: "kibo-voice" });
    expect((await fetch(`http://${host}/`)).status).toBe(404);
  });

  it("/ws: hello, then the relay's message and setupComplete, then a client message reaches Vertex", async () => {
    const host = await relay();
    const s = await createSession(getStore(), { kioskId: "malo", demo: true }, Date.now());
    const ws = new WebSocket(`ws://${host}/ws`);
    await new Promise((r) => ws.on("open", r));
    const first = messages(ws, 2);
    ws.send(JSON.stringify({ sessionId: s.sessionId, deviceToken: s.deviceToken, locale: "en" }));
    const [hello, setup] = await first;
    expect(hello).toMatchObject({ relay: { model: "gemini-3.8-live", voiceSeconds: 180 } });
    expect(setup).toEqual({ setupComplete: {} });
    ws.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text: "hi" }] }], turnComplete: true } }));
    await new Promise((r) => setTimeout(r, 50));
    expect(sent.some(([k]) => k === "clientContent")).toBe(true);
    ws.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(sent.some(([k]) => k === "close")).toBe(true);
  });

  it("a wrong token closes with 4401 and a plain reason", async () => {
    const host = await relay();
    const s = await createSession(getStore(), { kioskId: "malo", demo: true }, Date.now());
    const ws = new WebSocket(`ws://${host}/ws`);
    await new Promise((r) => ws.on("open", r));
    const closed = new Promise<[number, string]>((r) => ws.on("close", (code, why) => r([code, why.toString()])));
    ws.send(JSON.stringify({ sessionId: s.sessionId, deviceToken: "wrong", locale: "en" }));
    const [code, why] = await closed;
    expect(code).toBe(4401);
    expect(why.length).toBeGreaterThan(0);
  });

  it("other paths cannot upgrade", async () => {
    const host = await relay();
    const ws = new WebSocket(`ws://${host}/other`);
    await expect(new Promise((resolve, reject) => ws.on("open", resolve).on("error", reject))).rejects.toThrow();
  });
});
