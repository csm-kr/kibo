import type {
  LiveSendClientContentParameters,
  LiveSendRealtimeInputParameters,
  LiveSendToolResponseParameters,
  LiveServerMessage,
} from "@google/genai";
import type { ErrorCode } from "@/lib/commands/errors";
import type { SpeechLanguage } from "@/lib/i18n/languages";
import type { Locale } from "@/types/menu";

// The phone's side of the Vertex Live relay (kibo-voice, voice-relay/relay.ts; ADR-012). The relay speaks Live's
// own messages as JSON, so useLiveVoice handles both paths with one message handler: this link only adds the hello
// (browsers cannot set WebSocket headers, so the device token goes in the first message) and wraps sends.

/** What useLiveVoice needs of an open Live connection; the SDK's Session fits it too. */
export interface LiveLink {
  sendRealtimeInput(p: LiveSendRealtimeInputParameters): void;
  sendClientContent(p: LiveSendClientContentParameters): void;
  sendToolResponse(p: LiveSendToolResponseParameters): void;
  close(): void;
}

export interface RelayInfo {
  model: string;
  expiresAt: number;
  voiceSeconds: number;
}

/** The parts of a browser WebSocket the link uses. */
export interface SocketLike {
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(code?: number): void;
}

const OPEN = 1;

/** Opens the socket and says hello. Resolves once the relay has opened Live and sent its voice time; never
 *  rejects: a refusal or a drop, before or after, arrives as onclose with the relay's code. */
export function connectRelay(
  url: string,
  hello: { sessionId: string; deviceToken: string; locale: Locale; language?: SpeechLanguage },
  cb: { onready(info: RelayInfo): void; onmessage(m: LiveServerMessage): void; onclose(code: number): void },
  Socket: new (url: string) => SocketLike = WebSocket as unknown as new (url: string) => SocketLike,
): Promise<LiveLink> {
  const ws = new Socket(url);
  const send = (key: string, body: object) => {
    // A closing socket drops it; onclose then decides what happens.
    if (ws.readyState === OPEN) ws.send(JSON.stringify({ [key]: body }));
  };
  const link: LiveLink = {
    sendRealtimeInput: (p) => send("realtimeInput", p),
    sendClientContent: (p) => send("clientContent", p),
    sendToolResponse: (p) => send("toolResponse", p),
    close: () => ws.close(1000),
  };
  return new Promise((resolve) => {
    let ready = false;
    ws.onopen = () => ws.send(JSON.stringify(hello));
    ws.onmessage = (e) => {
      if (typeof e.data !== "string") return;
      let m: unknown;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (!m || typeof m !== "object") return;
      if (!ready) {
        const info = (m as { relay?: RelayInfo }).relay;
        if (!info) return;
        ready = true;
        cb.onready(info);
        resolve(link);
        return;
      }
      cb.onmessage(m as LiveServerMessage);
    };
    ws.onclose = (e) => cb.onclose(e.code);
    // onclose follows every error.
    ws.onerror = () => {};
  });
}

const BY_STATUS: Record<number, ErrorCode> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  410: "GONE",
  429: "RATE_LIMITED",
  502: "UPSTREAM",
};

/** The relay closes a refused start with 4000 + the HTTP status of the error code, and the end of voice time with
 *  4000. A refusal will not change on retry; a drop (1006, 1011), no hello in time (4408) or its own error (4500)
 *  may, so those reconnect through /api/live-token, which can also send the phone back to the direct path. */
export function relayCloseOutcome(code: number): "retry" | "timeUp" | ErrorCode {
  if (code === 4000) return "timeUp";
  return BY_STATUS[code - 4000] ?? "retry";
}
