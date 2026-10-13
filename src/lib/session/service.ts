import { randomBytes, randomInt } from "node:crypto";
import { getKiosk, isKioskId } from "@/lib/adapters/catalog";
import { CommandError } from "@/lib/commands/errors";
import {
  applyCommand,
  BEFORE_PAYING,
  type CommandResult,
} from "@/lib/commands/machine";
import { parseCommand } from "@/lib/commands/schemas";
import { newSession, SESSION_TTL_MS } from "@/lib/commands/session";
import type {
  SessionSecrets,
  SessionStore,
  TransactResult,
} from "@/lib/store/types";
import { hashToken, newSessionId, newToken, tokenMatches } from "@/lib/tokens";
import type { Actor, CartLine, Session, SessionStatus } from "@/types/session";

// Store + state machine. Randomness and the clock are read outside the transaction functions,
// because Firestore may run them several times and a retry must not change ids or tokens.

export interface CreateResult {
  sessionId: string;
  claimToken: string;
  kioskToken: string;
  deviceToken?: string;
  /** 6 digits for `/app`; absent on /demo sessions claimed from the start (all but `pairPhone`). */
  pairCode?: string;
  expiresAt: number;
}

export interface CommandResponse {
  ok: true;
  /** Learned kiosks: accepted, and the cart changes once the bridge reports the kiosk's own screen. */
  pending?: true;
  status: SessionStatus;
  cart: CartLine[];
  total: number;
  cartVersion: number;
  result?: CommandResult & { claimToken?: string; pairCode?: string };
  duplicate?: boolean;
}

/** How many command results sessionSecrets keeps for retries (`recentCommandIds` keeps 30 ids). */
export const RECENT_RESULTS = 10;

const NOT_FOUND = "This order could not be found.";
const GONE = "This order has ended. Please start again at the kiosk.";
const UNAUTHORIZED = "Please scan the QR code on the kiosk again.";
const WRONG_CODE =
  "That code doesn't match a kiosk. Check the number on the kiosk screen.";

/**
 * A pairing code works for at most an hour after the kiosk showed it, and only while its session lives and is
 * unclaimed. Kiosk sessions expire after 10 idle minutes, so an hour only matters for a long touch order.
 */
export const PAIR_CODE_TTL_MS = 60 * 60 * 1000;
const PAIR_CODE_TRIES = 5;

function newPairCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Reserves a code no live session holds; throws (INTERNAL) if every draw was taken. */
export async function reservePairCode(
  store: SessionStore,
  sessionId: string,
  now: number,
  draw = newPairCode,
): Promise<string> {
  for (let i = 0; i < PAIR_CODE_TRIES; i++) {
    const code = draw();
    if (
      await store.reservePairCode(
        code,
        { sessionId, expiresAt: now + PAIR_CODE_TTL_MS },
        now,
      )
    )
      return code;
  }
  throw new Error("No free pairing code");
}

function isExpired(s: Session, now: number): boolean {
  return s.status === "expired" || now > s.expiresAt;
}

function actorFor(bearer: string | null, sec: SessionSecrets): Actor {
  if (bearer !== null && tokenMatches(bearer, sec.kioskTokenHash))
    return "kiosk";
  if (bearer !== null && tokenMatches(bearer, sec.deviceTokenHash))
    return "phone";
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
  return {
    session: s.status === "expired" ? undefined : { ...s, status: "expired" },
    value: { gone: true },
  };
}

export async function createSession(
  store: SessionStore,
  input: { kioskId: string; demo?: boolean; pairPhone?: boolean },
  now: number,
): Promise<CreateResult> {
  if (!isKioskId(input.kioskId))
    throw new CommandError("BAD_REQUEST", "This kiosk is not available.");
  if (input.pairPhone && input.demo !== true)
    throw new CommandError(
      "BAD_REQUEST",
      "Only a demo order can wait for a phone this way.",
    );
  const demo = input.demo === true;
  // /demo "Use my phone": still a demo session (demo limits), but a real phone claims it by QR or code.
  const preClaimed = demo && input.pairPhone !== true;
  const sessionId = newSessionId();
  const claimToken = newToken();
  const kioskToken = newToken();
  const deviceToken = preClaimed ? newToken() : undefined;

  let session = newSession({ sessionId, kioskId: input.kioskId, demo, now });
  // /demo holds both tokens on one page, so the phone half is connected from the start.
  if (preClaimed)
    session = { ...session, status: "connected", phoneConnectedAt: now };
  const pairCode = preClaimed
    ? undefined
    : await reservePairCode(store, sessionId, now);
  await store.create(session, {
    claimTokenHash: hashToken(claimToken),
    claimed: preClaimed,
    deviceTokenHash: deviceToken ? hashToken(deviceToken) : null,
    kioskTokenHash: hashToken(kioskToken),
    ...(pairCode ? { pairCode } : {}),
    createdAt: now,
    expiresAt: session.expiresAt,
  });
  return {
    sessionId,
    claimToken,
    kioskToken,
    ...(deviceToken ? { deviceToken } : {}),
    ...(pairCode ? { pairCode } : {}),
    expiresAt: session.expiresAt,
  };
}

/** Inside a transaction: the phone takes the session (QR claim or pairing code). */
function claimWith(
  s: Session,
  sec: SessionSecrets,
  now: number,
  deviceToken: string,
): TransactResult<Outcome<Session>> {
  if (sec.claimed)
    throw new CommandError("CONFLICT", "Someone else is using this kiosk.");
  const expiresAt = now + SESSION_TTL_MS;
  const session: Session = {
    ...s,
    // A mid-order claim keeps `ordering` (Flow B).
    status: s.status === "idle" ? "connected" : s.status,
    phoneConnectedAt: now,
    phoneSeenAt: now,
    expiresAt,
  };
  return {
    session,
    secrets: {
      ...sec,
      claimed: true,
      deviceTokenHash: hashToken(deviceToken),
      expiresAt,
    },
    value: { ok: session },
  };
}

export async function claimSession(
  store: SessionStore,
  input: { sessionId: string; claimToken: string },
  now: number,
): Promise<{ deviceToken: string; session: Session }> {
  const deviceToken = newToken();
  const out = await store.transact<Outcome<Session>>(
    input.sessionId,
    (s, sec) => {
      if (!s || !sec) throw new CommandError("NOT_FOUND", NOT_FOUND);
      if (isExpired(s, now)) return expire(s);
      if (!tokenMatches(input.claimToken, sec.claimTokenHash))
        throw new CommandError("UNAUTHORIZED", UNAUTHORIZED);
      return claimWith(s, sec, now, deviceToken);
    },
  );
  return { deviceToken, session: unwrap(out) };
}

/** `/app`'s code field: the same result as a QR claim. The code is single use: cleared in the claim, then deleted. */
export async function pairSession(
  store: SessionStore,
  input: { code: string },
  now: number,
): Promise<{ sessionId: string; deviceToken: string; session: Session }> {
  const entry = await store.getPairCode(input.code);
  if (!entry || entry.expiresAt <= now)
    throw new CommandError("NOT_FOUND", WRONG_CODE);
  const deviceToken = newToken();
  const out = await store.transact<Outcome<Session>>(
    entry.sessionId,
    (s, sec) => {
      // A rotated or used code may still have its entry until it is deleted; only the session's current code counts.
      if (!s || !sec || sec.pairCode !== input.code)
        throw new CommandError("NOT_FOUND", WRONG_CODE);
      if (isExpired(s, now)) return expire(s);
      return claimWith(s, { ...sec, pairCode: null }, now, deviceToken);
    },
  );
  const session = unwrap(out);
  await store.deletePairCode(input.code, entry.sessionId);
  return { sessionId: entry.sessionId, deviceToken, session };
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
  // The new pairing code is its own write, so it is reserved before the transaction; afterwards whichever code
  // the session no longer uses (the new one if nothing rotated, else the old one) is deleted.
  const pairCode = claimToken
    ? await reservePairCode(store, cmd.sessionId, now)
    : undefined;
  const rotation: { replaced?: string | null } = {};

  let out: Outcome<CommandResponse>;
  try {
    out = await store.transact<Outcome<CommandResponse>>(
      cmd.sessionId,
      (s, sec) => {
        // fn may run more than once; only the committed run's rotation counts.
        delete rotation.replaced;
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
          ...(result.pending ? { pending: true as const } : {}),
          status: session.status,
          cart: session.cart,
          total: session.total,
          cartVersion: session.cartVersion,
          result,
        };
        // [Connect another phone]: the old phone's token stops working and a new QR can be claimed.
        const rotate = (sess: Session, secs: SessionSecrets, token: string) => {
          response.result = { ...response.result, claimToken: token, pairCode };
          rotation.replaced = secs.pairCode ?? null;
          return {
            session: { ...sess, phoneConnectedAt: null },
            secrets: {
              ...secs,
              claimTokenHash: hashToken(token),
              claimed: false,
              deviceTokenHash: null,
              pairCode,
            },
          };
        };

        if (duplicate) {
          const stored = sec.recentResults?.find(
            (r) => r.commandId === cmd.commandId,
          );
          response.result = stored?.result ?? result;
          if (response.result.pending) response.pending = true;
          response.duplicate = true;
          // The first answer's claim token was never stored. Its QR is already void, so rotating again is safe,
          // but only in the states where reissueClaim itself is accepted.
          if (
            claimToken &&
            stored &&
            BEFORE_PAYING.includes(s.status) &&
            !isExpired(s, now)
          ) {
            return { ...rotate(s, sec, claimToken), value: { ok: response } };
          }
          return { value: { ok: response } };
        }

        // Secrets expire with the session (TTL), so they move with every extension.
        let secrets: SessionSecrets = { ...sec, expiresAt: session.expiresAt };
        if (claimToken || Object.keys(result).length > 0) {
          const entry = { commandId: cmd.commandId, result };
          secrets.recentResults = [...(sec.recentResults ?? []), entry].slice(
            -RECENT_RESULTS,
          );
        }
        let next = session;
        if (claimToken)
          ({ session: next, secrets } = rotate(session, secrets, claimToken));
        return { session: next, secrets, value: { ok: response } };
      },
    );
  } finally {
    if (pairCode) {
      const unused = "replaced" in rotation ? rotation.replaced : pairCode;
      if (unused) await store.deletePairCode(unused, cmd.sessionId);
    }
  }
  return unwrap(out);
}

export async function ping(
  store: SessionStore,
  input: { sessionId: string; bearer: string | null; active: boolean },
  now: number,
): Promise<{ status: SessionStatus; expiresAt: number; serverTime: number }> {
  const out = await store.transact<
    Outcome<{ status: SessionStatus; expiresAt: number }>
  >(input.sessionId, (s, sec) => {
    if (!s || !sec) throw new CommandError("NOT_FOUND", NOT_FOUND);
    const actor = actorFor(input.bearer, sec);
    if (isExpired(s, now)) return expire(s);
    // Expiry is extended only when the user was active in the last 30 s (SECURITY "Reliability").
    const expiresAt = input.active ? now + SESSION_TTL_MS : s.expiresAt;
    const session: Session = {
      ...s,
      lastSeenAt: now,
      expiresAt,
      ...(actor === "phone" ? { phoneSeenAt: now } : {}),
    };
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
  input: {
    sessionId: string;
    bearer: string | null;
    field: "chatCount" | "liveTokenCount";
    limit: number;
    /** States the counted thing is allowed in; another state is CONFLICT before anything is counted (I-150). */
    states?: SessionStatus[];
  },
  now: number,
): Promise<{ allowed: boolean; session: Session }> {
  const out = await store.transact<
    Outcome<{ allowed: boolean; session: Session }>
  >(input.sessionId, (s, sec) => {
    if (!s || !sec) throw new CommandError("NOT_FOUND", NOT_FOUND);
    if (actorFor(input.bearer, sec) !== "phone")
      throw new CommandError("FORBIDDEN", "Please use the phone for this.");
    if (isExpired(s, now)) return expire(s);
    if (input.states && !input.states.includes(s.status))
      throw new CommandError("CONFLICT", "The order can no longer be changed.");
    const count = sec[input.field] ?? 0;
    if (count >= input.limit)
      return { value: { ok: { allowed: false, session: s } } };
    return {
      secrets: { ...sec, [input.field]: count + 1 },
      value: { ok: { allowed: true, session: s } },
    };
  });
  return unwrap(out);
}

/** Takes back one count of bumpSessionCounter whose work never happened (a Live token the issuer failed to create, I-150). */
export async function refundSessionCounter(
  store: SessionStore,
  input: { sessionId: string; field: "chatCount" | "liveTokenCount" },
): Promise<void> {
  await store.transact(input.sessionId, (_s, sec) => {
    const count = sec?.[input.field] ?? 0;
    return sec && count > 0
      ? { secrets: { ...sec, [input.field]: count - 1 }, value: undefined }
      : { value: undefined };
  });
}
