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
}

export interface CommandReply {
  status: SessionStatus;
  cart: CartLine[];
  total: number;
  cartVersion: number;
  result?: CommandResult;
  duplicate?: boolean;
  claimUrl?: string;
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

export function createSession(kioskId: string, demo?: boolean): Promise<CreatedSession> {
  return post("/api/session", demo ? { kioskId, demo } : { kioskId });
}

export function sendCommand(input: {
  sessionId: string;
  token: string;
  type: CommandType;
  args: object;
  source: Source;
  cartVersion?: number;
  utteranceSeq?: number;
}): Promise<CommandReply> {
  const { token, ...rest } = input;
  return post("/api/command", { ...rest, commandId: crypto.randomUUID() }, token);
}

export function ping(input: { sessionId: string; token: string; active: boolean }): Promise<PingReply> {
  return post("/api/ping", { sessionId: input.sessionId, active: input.active }, input.token);
}

export function claim(input: { sessionId: string; claimToken: string }): Promise<{ deviceToken: string; status: SessionStatus }> {
  return post("/api/session/claim", input);
}

export interface ChatReply {
  reply: string;
  status: SessionStatus;
  cart: CartLine[];
  total: number;
  cartVersion: number;
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
