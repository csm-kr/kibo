import type { AgentAction } from "@/lib/agent/actions";
import { HTTP_STATUS, type ErrorDetail } from "@/lib/commands/errors";
import type { CommandResult } from "@/lib/commands/machine";
import type { CommandType } from "@/lib/commands/schemas";
import type { ScreenErrorCode } from "@/lib/i18n/errors";
import type { Locale } from "@/types/menu";
import type { CartLine, SessionStatus, Source } from "@/types/session";

// Browser side of the API (docs/ARCHITECTURE.md "API"). Screens show errorCopy(code), never `message`.

export class ApiError extends Error {
  constructor(
    public code: ScreenErrorCode,
    message: string,
    public detail?: ErrorDetail,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface CreatedSession {
  sessionId: string;
  claimUrl: string;
  kioskToken: string;
  expiresAt: number;
  deviceToken?: string;
  /** 6 digits the phone can type on /app; absent on /demo sessions unless `pairPhone`. */
  pairCode?: string;
}

export interface CommandReply {
  status: SessionStatus;
  cart: CartLine[];
  total: number;
  cartVersion: number;
  result?: CommandResult;
  duplicate?: boolean;
  claimUrl?: string;
  /** reissueClaim: the new pairing code that replaces the old one. */
  pairCode?: string;
}

export interface PingReply {
  status: SessionStatus;
  expiresAt: number;
  serverTime: number;
}

async function post<T>(path: string, body: object, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
  } catch {
    throw new ApiError("NETWORK", "Connection problem. Please try again.");
  }
  let json: { ok?: boolean; error?: { code?: unknown; message?: unknown; detail?: ErrorDetail } };
  try {
    json = await res.json();
  } catch {
    // A proxy page or a cut-off body: an answer came, but not ours.
    throw new ApiError("INTERNAL", "Something went wrong. Please try again.");
  }
  if (json.ok === true) return json as T;
  const code = json.error?.code;
  if (typeof code !== "string" || !Object.hasOwn(HTTP_STATUS, code)) {
    throw new ApiError("INTERNAL", "Something went wrong. Please try again.");
  }
  const message = typeof json.error?.message === "string" ? json.error.message : "";
  throw new ApiError(code as ScreenErrorCode, message, json.error?.detail);
}

/** `pairPhone` (with `demo`): /demo "Use my phone", a demo session the judge's own phone claims. */
export function createSession(kioskId: string, demo?: boolean, pairPhone?: boolean): Promise<CreatedSession> {
  return post("/api/session", demo ? { kioskId, demo, ...(pairPhone ? { pairPhone } : {}) } : { kioskId });
}

export function sendCommand(input: {
  sessionId: string;
  token: string;
  type: CommandType;
  args: object;
  source: Source;
  cartVersion?: number;
  utteranceSeq?: number;
  /** Voice passes `<liveSessionId>:<functionCallId>`; everything else gets a fresh uuid. */
  commandId?: string;
}): Promise<CommandReply> {
  const { token, commandId, ...rest } = input;
  return post("/api/command", { ...rest, commandId: commandId ?? crypto.randomUUID() }, token);
}

export function ping(input: { sessionId: string; token: string; active: boolean }): Promise<PingReply> {
  return post("/api/ping", { sessionId: input.sessionId, active: input.active }, input.token);
}

export function claim(input: { sessionId: string; claimToken: string }): Promise<{ deviceToken: string; status: SessionStatus }> {
  return post("/api/session/claim", input);
}

/** /app's code field: the kiosk's 6-digit code instead of a QR claim token. */
export function pair(code: string): Promise<{ sessionId: string; deviceToken: string; status: SessionStatus }> {
  return post("/api/session/pair", { code });
}

export interface LiveTokenReply {
  token: string;
  model: string;
  expiresAt: number;
  voiceSeconds: number;
}

/** One-use Gemini Live token; model, instructions and tools are pinned in it (ADR-003). */
export function liveToken(input: { sessionId: string; token: string; locale: Locale }): Promise<LiveTokenReply> {
  return post("/api/live-token", { sessionId: input.sessionId, locale: input.locale }, input.token);
}

export interface ChatReply {
  reply: string;
  status: SessionStatus;
  cart: CartLine[];
  total: number;
  cartVersion: number;
  /** What the AI did in this request (ids and codes only), for /demo. */
  actions: AgentAction[];
}

/** One user utterance to the text agent; `cartVersion` only when the confirm card is showing. */
export function chat(input: {
  sessionId: string;
  token: string;
  message: string;
  history: { role: "user" | "model"; text: string }[];
  utteranceSeq: number;
  cartVersion?: number;
  locale: Locale;
}): Promise<ChatReply> {
  const { token, ...rest } = input;
  return post("/api/chat", { ...rest, chatRequestId: crypto.randomUUID() }, token);
}
