import { randomBytes, randomInt } from "node:crypto";
import { getKiosk, isKioskId } from "@/lib/adapters/catalog";
import { CommandError } from "@/lib/commands/errors";
import { applyCommand, BEFORE_PAYING, type CommandResult } from "@/lib/commands/machine";
import { parseCommand } from "@/lib/commands/schemas";
import { newSession, SESSION_TTL_MS } from "@/lib/commands/session";
import type { SessionSecrets, SessionStore } from "@/lib/store/types";
import { hashToken, newSessionId, newToken, tokenMatches } from "@/lib/tokens";
import type { Actor, CartLine, Session, SessionStatus } from "@/types/session";

// Store + state machine. Randomness and the clock are read outside the transaction functions,
// because Firestore may run them several times and a retry must not change ids or tokens.

export interface CreateResult {
  sessionId: string;
  claimToken: string;
  kioskToken: string;
  deviceToken?: string;
  expiresAt: number;
}

export interface CommandResponse {
  ok: true;
  status: SessionStatus;
  cart: CartLine[];
  total: number;
  cartVersion: number;
  result?: CommandResult & { claimToken?: string };
  duplicate?: boolean;
}

/** How many command results sessionSecrets keeps for retries (`recentCommandIds` keeps 30 ids). */
export const RECENT_RESULTS = 10;

const NOT_FOUND = "This order could not be found.";
const GONE = "This order has ended. Please start again at the kiosk.";
const UNAUTHORIZED = "Please scan the QR code on the kiosk again.";

function isExpired(s: Session, now: number): boolean {
  return s.status === "expired" || now > s.expiresAt;
}

function actorFor(bearer: string | null, sec: SessionSecrets): Actor {
  if (bearer !== null && tokenMatches(bearer, sec.kioskTokenHash)) return "kiosk";
  if (bearer !== null && tokenMatches(bearer, sec.deviceTokenHash)) return "phone";
  throw new CommandError("UNAUTHORIZED", UNAUTHORIZED);
}

/** lineIds must match the command schema's id pattern (^[a-z0-9_]+$), so hex rather than base64url. */
function newLineId(): string {
  return randomBytes(8).toString("hex");
}

type Outcome<T> = { ok: T } | { gone: true };

/** Throws GONE after the transaction committed `expired`, so screens see the session end. */
function unwrap<T>(out: Outcome<T>): T {
  if ("gone" in out) throw new CommandError("GONE", GONE);
  return out.ok;
}

/** Inside a transaction: an expired session is written as `expired` (once) and reported as gone. */
function expire(s: Session): { session?: Session; value: { gone: true } } {
  return { session: s.status === "expired" ? undefined : { ...s, status: "expired" }, value: { gone: true } };
}

export async function createSession(
  store: SessionStore,
  input: { kioskId: string; demo?: boolean },
  now: number,
): Promise<CreateResult> {
  if (!isKioskId(input.kioskId)) throw new CommandError("BAD_REQUEST", "This kiosk is not available.");
  const demo = input.demo === true;
  const sessionId = newSessionId();
  const claimToken = newToken();
  const kioskToken = newToken();
  const deviceToken = demo ? newToken() : undefined;

  let session = newSession({ sessionId, kioskId: input.kioskId, demo, now });
  // /demo holds both tokens on one page, so the phone half is connected from the start.
  if (demo) session = { ...session, status: "connected", phoneConnectedAt: now };
  await store.create(session, {
    claimTokenHash: hashToken(claimToken),
    claimed: demo,
    deviceTokenHash: deviceToken ? hashToken(deviceToken) : null,
    kioskTokenHash: hashToken(kioskToken),
    createdAt: now,
    expiresAt: session.expiresAt,
  });
  return { sessionId, claimToken, kioskToken, ...(deviceToken ? { deviceToken } : {}), expiresAt: session.expiresAt };
}

export async function claimSession(
  store: SessionStore,
  input: { sessionId: string; claimToken: string },
  now: number,
): Promise<{ deviceToken: string; session: Session }> {
  const deviceToken = newToken();
  const out = await store.transact<Outcome<Session>>(input.sessionId, (s, sec) => {
    if (!s || !sec) throw new CommandError("NOT_FOUND", NOT_FOUND);
    if (isExpired(s, now)) return expire(s);
    if (!tokenMatches(input.claimToken, sec.claimTokenHash)) throw new CommandError("UNAUTHORIZED", UNAUTHORIZED);
    if (sec.claimed) throw new CommandError("CONFLICT", "Someone else is using this kiosk.");
    const expiresAt = now + SESSION_TTL_MS;
    const session: Session = {
      ...s,
      // A mid-order claim keeps `ordering` (Flow B).
      status: s.status === "idle" ? "connected" : s.status,
      phoneConnectedAt: now,
      phoneSeenAt: now,
      expiresAt,
    };
    return { session, secrets: { ...sec, claimed: true, deviceTokenHash: hashToken(deviceToken), expiresAt }, value: { ok: session } };
  });
  return { deviceToken, session: unwrap(out) };
}

export async function runCommand(
  store: SessionStore,
  input: { body: unknown; bearer: string | null },
  now: number,
): Promise<CommandResponse> {
  const cmd = parseCommand(input.body);
  const lineId = newLineId();
  const orderNumber = randomInt(101, 1000);
  const claimToken = cmd.type === "reissueClaim" ? newToken() : undefined;

  const out = await store.transact<Outcome<CommandResponse>>(cmd.sessionId, (s, sec) => {
    if (!s || !sec) throw new CommandError("NOT_FOUND", NOT_FOUND);
    const actor = actorFor(input.bearer, sec);
    let applied: ReturnType<typeof applyCommand>;
    try {
      applied = applyCommand(s, cmd, {
        actor,
        now,
        kiosk: getKiosk(s.kioskId),
        newLineId: () => lineId,
        newOrderNumber: () => orderNumber,
      });
    } catch (e) {
      if (e instanceof CommandError && e.code === "GONE") return expire(s);
      throw e;
    }
    const { session, result, duplicate } = applied;
    const response: CommandResponse = {
      ok: true,
      status: session.status,
      cart: session.cart,
      total: session.total,
      cartVersion: session.cartVersion,
      result,
    };
    // [Connect another phone]: the old phone's token stops working and a new QR can be claimed.
    const rotate = (sess: Session, secs: SessionSecrets, token: string) => {
      response.result = { ...response.result, claimToken: token };
      return {
        session: { ...sess, phoneConnectedAt: null },
        secrets: { ...secs, claimTokenHash: hashToken(token), claimed: false, deviceTokenHash: null },
      };
    };

    if (duplicate) {
      const stored = sec.recentResults?.find((r) => r.commandId === cmd.commandId);
      response.result = stored?.result ?? result;
      response.duplicate = true;
      // The first answer's claim token was never stored. Its QR is already void, so rotating again is safe,
      // but only in the states where reissueClaim itself is accepted.
      if (claimToken && stored && BEFORE_PAYING.includes(s.status) && !isExpired(s, now)) {
        return { ...rotate(s, sec, claimToken), value: { ok: response } };
      }
      return { value: { ok: response } };
    }

    // Secrets expire with the session (TTL), so they move with every extension.
    let secrets: SessionSecrets = { ...sec, expiresAt: session.expiresAt };
    if (claimToken || Object.keys(result).length > 0) {
      const entry = { commandId: cmd.commandId, result };
      secrets.recentResults = [...(sec.recentResults ?? []), entry].slice(-RECENT_RESULTS);
    }
    let next = session;
    if (claimToken) ({ session: next, secrets } = rotate(session, secrets, claimToken));
    return { session: next, secrets, value: { ok: response } };
  });
  return unwrap(out);
}

export async function ping(
  store: SessionStore,
  input: { sessionId: string; bearer: string | null; active: boolean },
  now: number,
): Promise<{ status: SessionStatus; expiresAt: number; serverTime: number }> {
  const out = await store.transact<Outcome<{ status: SessionStatus; expiresAt: number }>>(input.sessionId, (s, sec) => {
    if (!s || !sec) throw new CommandError("NOT_FOUND", NOT_FOUND);
    const actor = actorFor(input.bearer, sec);
    if (isExpired(s, now)) return expire(s);
    // Expiry is extended only when the user was active in the last 30 s (SECURITY "Reliability").
    const expiresAt = input.active ? now + SESSION_TTL_MS : s.expiresAt;
    const session: Session = { ...s, lastSeenAt: now, expiresAt, ...(actor === "phone" ? { phoneSeenAt: now } : {}) };
    return {
      session,
      secrets: input.active ? { ...sec, expiresAt } : undefined,
      value: { ok: { status: session.status, expiresAt } },
    };
  });
  return { ...unwrap(out), serverTime: now };
}

/**
 * Counts one use of a per-session limit in sessionSecrets, where no client can see or change it.
 * Only the phone may use it. At the limit nothing is written and `allowed` is false.
 */
export async function bumpSessionCounter(
  store: SessionStore,
  input: { sessionId: string; bearer: string | null; field: "chatCount" | "liveTokenCount"; limit: number },
  now: number,
): Promise<{ allowed: boolean; session: Session }> {
  const out = await store.transact<Outcome<{ allowed: boolean; session: Session }>>(input.sessionId, (s, sec) => {
    if (!s || !sec) throw new CommandError("NOT_FOUND", NOT_FOUND);
    if (actorFor(input.bearer, sec) !== "phone") throw new CommandError("FORBIDDEN", "Please use the phone for this.");
    if (isExpired(s, now)) return expire(s);
    const count = sec[input.field] ?? 0;
    if (count >= input.limit) return { value: { ok: { allowed: false, session: s } } };
    return { secrets: { ...sec, [input.field]: count + 1 }, value: { ok: { allowed: true, session: s } } };
  });
  return unwrap(out);
}
