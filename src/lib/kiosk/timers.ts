import type { Session, SessionStatus } from "@/types/session";

// Kiosk timers (docs/UX.md "Exception flows", A11). Session times are server epoch ms, so every helper
// compares them with server time: the local clock plus the offset measured by ping.

const WARN_MS = 60_000;
const PAUSED_MS = 60_000;
const STAFF_MS = 60_000;
const DONE_MS = 10_000;
const WORKING_MS = 20_000;

/** Someone is ordering; on the attract screen (idle) nobody needs a warning. */
const ORDERING: ReadonlySet<SessionStatus> = new Set(["connected", "ordering", "confirming", "paying"]);
/** Before payment: the states in which the AI's tools can still change the order. */
const AI_CAN_CHANGE: ReadonlySet<SessionStatus> = new Set(["connected", "ordering", "confirming"]);

/** "Still ordering?" during the last 60 s before expiry. */
export function idleWarning(session: Session, now: number, clockOffset: number): { show: boolean; secondsLeft: number } {
  const left = session.expiresAt - (now + clockOffset);
  const secondsLeft = Math.max(0, Math.ceil(left / 1000));
  return { show: ORDERING.has(session.status) && left > 0 && left <= WARN_MS, secondsLeft };
}

/** A phone is connected but has not pinged for more than 60 s. */
export function phonePaused(session: Session, now: number, clockOffset: number): boolean {
  if (session.phoneConnectedAt === null || !ORDERING.has(session.status)) return false;
  const seen = session.phoneSeenAt ?? session.phoneConnectedAt;
  return now + clockOffset - seen > PAUSED_MS;
}

/** Staff was called within the last 60 s. */
export function staffBannerVisible(session: Session, now: number, clockOffset: number): boolean {
  if (!session.staffCalled) return false;
  return now + clockOffset - session.staffCalled.at <= STAFF_MS;
}

/**
 * The phone is waiting for the AI on an order it can still change, and said so within 20 s; the age limit keeps a
 * phone that went away mid-request from leaving "KIBO is working…" on the kiosk.
 */
export function kiboWorking(session: Session, now: number, clockOffset: number): boolean {
  const at = session.phoneWorkingAt ?? null;
  if (at === null || !AI_CAN_CHANGE.has(session.status)) return false;
  return now + clockOffset - at <= WORKING_MS;
}

/** Seconds left of the 10 s before the kiosk returns to the attract screen. */
export function doneCountdown(paidAt: number, now: number, clockOffset: number): number {
  // The offset is measured on arrival of a ping, so it can trail the server by the network delay; capped so the
  // screen never shows "11".
  const left = Math.ceil((paidAt + DONE_MS - (now + clockOffset)) / 1000);
  return Math.min(DONE_MS / 1000, Math.max(0, left));
}
