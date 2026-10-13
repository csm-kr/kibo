import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { GoogleGenAI, type LiveSendClientContentParameters, type LiveSendRealtimeInputParameters, type LiveSendToolResponseParameters } from "@google/genai";
import { WebSocketServer } from "ws";
import { clientIp } from "@/lib/http";
import { getUsageStore } from "@/lib/limits/usage";
import { getStore } from "@/lib/store";
import { relayConnection, type OpenLive } from "./relay";

// kibo-voice: a small Cloud Run service next to the Next.js app (which cannot accept WebSocket upgrades).
// GET /health for checks, /ws for the browser's voice connection (voice-relay/relay.ts).

/** Audio frames are a few KB; anything far larger is not a voice message. */
const MAX_PAYLOAD = 256 * 1024;

/** Vertex AI Live with the runtime service account's credentials (ADC). gemini-3.8-live was served only in
 *  us-central1 on 10-13 (orchestrator check), so the location is its own setting, not the text agent's. */
export function vertexOpenLive(): OpenLive {
  let ai: GoogleGenAI | null = null;
  return async ({ model, config, onMessage, onClose }) => {
    // An explicit project and location make the SDK ignore any API key in the environment.
    ai ??= new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT || "kibo-2026",
      location: process.env.VOICE_VERTEX_LOCATION || "us-central1",
    });
    const session = await ai.live.connect({
      model,
      config,
      callbacks: {
        onmessage: (m) => onMessage(m),
        onclose: () => onClose(),
        // onclose follows every error.
        onerror: () => {},
      },
    });
    return {
      sendRealtimeInput: (p) => session.sendRealtimeInput(p as LiveSendRealtimeInputParameters),
      sendClientContent: (p) => session.sendClientContent(p as LiveSendClientContentParameters),
      sendToolResponse: (p) => session.sendToolResponse(p as LiveSendToolResponseParameters),
      close: () => session.close(),
    };
  };
}

function ipOf(req: IncomingMessage): string {
  const xff = req.headers["x-forwarded-for"];
  return clientIp(new Request("http://relay/", { headers: { "x-forwarded-for": Array.isArray(xff) ? xff.join(",") : (xff ?? "") } }));
}

export async function startRelay(opts: { port: number; openLive?: OpenLive }): Promise<{ port: number; close(): Promise<void> }> {
  const openLive = opts.openLive ?? vertexOpenLive();
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ ok: true, service: "kibo-voice", revision: process.env.K_REVISION ?? "local" }));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false }));
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });

  server.on("upgrade", (req, socket, head) => {
    if (new URL(req.url ?? "/", "http://relay").pathname !== "/ws") return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => {
      const relay = relayConnection(
        {
          send: (data) => ws.send(data),
          close: (code, reason) => ws.close(code, reason),
        },
        { store: getStore(), usage: getUsageStore(), now: Date.now, ip: ipOf(req), openLive },
      );
      ws.on("message", (data, isBinary) => {
        if (!isBinary) relay.onMessage(data.toString());
      });
      ws.on("close", () => relay.onClose());
      // close follows every error; nothing about the socket's content is logged.
      ws.on("error", () => {});
    });
  });

  await new Promise<void>((resolve) => server.listen(opts.port, resolve));
  return {
    port: (server.address() as AddressInfo).port,
    close: () =>
      new Promise<void>((resolve) => {
        for (const ws of wss.clients) ws.terminate();
        wss.close();
        server.close(() => resolve());
      }),
  };
}
