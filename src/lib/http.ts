import type { z } from "zod";
import { CommandError, HTTP_STATUS } from "@/lib/commands/errors";

// Shared by every route handler. Error messages are shown to users: plain words, no ids or stack traces.

const NOT_UNDERSTOOD = "That request could not be understood.";

/** Reads at most maxBytes, so an oversized body is refused without buffering it all. */
export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const tooLarge = new CommandError("BAD_REQUEST", "That request is too large.");
  if (Number(req.headers.get("content-length")) > maxBytes) throw tooLarge;
  const reader = req.body?.getReader();
  if (!reader) throw new CommandError("BAD_REQUEST", NOT_UNDERSTOOD);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw tooLarge;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new CommandError("BAD_REQUEST", NOT_UNDERSTOOD);
  }
}

export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new CommandError("BAD_REQUEST", NOT_UNDERSTOOD);
  return parsed.data;
}

export function bearer(req: Request): string | null {
  const m = /^Bearer ([A-Za-z0-9_-]{1,128})$/.exec(req.headers.get("authorization") ?? "");
  return m ? m[1] : null;
}

const NO_STORE = { "Cache-Control": "no-store" };

export function ok(body: object, init?: ResponseInit): Response {
  return Response.json({ ok: true, ...body }, { ...init, headers: { ...NO_STORE, ...init?.headers } });
}

export function fail(err: unknown): Response {
  if (err instanceof CommandError) {
    const error = { code: err.code, message: err.message, ...(err.detail ? { detail: err.detail } : {}) };
    return Response.json({ ok: false, error }, { status: HTTP_STATUS[err.code], headers: NO_STORE });
  }
  // Name only: messages can carry request data or tokens (SECURITY "Secrets and repo hygiene").
  console.error("api error:", err instanceof Error ? err.name : typeof err);
  return Response.json(
    { ok: false, error: { code: "INTERNAL", message: "Something went wrong. Please try again." } },
    { status: HTTP_STATUS.INTERNAL, headers: NO_STORE },
  );
}

/** The last X-Forwarded-For value is the one Cloud Run appends; earlier hops are client-controlled. */
export function clientIp(req: Request): string {
  const hops = (req.headers.get("x-forwarded-for") ?? "").split(",");
  return hops[hops.length - 1].trim() || "local";
}

/** `PUBLIC_ORIGIN` (set by scripts/deploy.sh to the deterministic Cloud Run URL) when it is a valid http(s) origin. */
function configuredOrigin(): string | null {
  const raw = process.env.PUBLIC_ORIGIN;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

export function publicOrigin(req: Request): string {
  const configured = configuredOrigin();
  if (configured) return configured;
  const url = new URL(req.url);
  const first = (name: string) => req.headers.get(name)?.split(",")[0].trim() || null;
  const host = first("x-forwarded-host") ?? first("host");
  if (!host) return url.origin;
  const forwarded = first("x-forwarded-proto");
  const proto = forwarded === "http" || forwarded === "https" ? forwarded : url.protocol.slice(0, -1);
  return `${proto}://${host}`;
}

/** The claim token goes in the fragment, which browsers never send to a server or in a Referer. */
export function claimUrl(req: Request, sessionId: string, claimToken: string): string {
  return `${publicOrigin(req)}/assistant?s=${encodeURIComponent(sessionId)}#t=${claimToken}`;
}
