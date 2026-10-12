import type { Session, SessionStatus } from "@/types/session";

// Kiosk timers (docs/UX.md "Exception flows", A11). Session times are server epoch ms, so every helper
// compares them with server time: the local clock plus the offset measured by ping.

const WARN_MS = 60_000;
const PAUSED_MS = 60_000;
const STAFF_MS = 60_000;
const DONE_MS = 10_000;

/** Someone is ordering; on the attract screen (idle) nobody needs a warning. */
const ORDERING: ReadonlySet<SessionStatus> = new Set(["connected", "ordering", "confirming", "paying"]);

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

/** Seconds left of the 10 s before the kiosk returns to the attract screen. */
export function doneCountdown(paidAt: number, now: number, clockOffset: number): number {
  return Math.max(0, Math.ceil((paidAt + DONE_MS - (now + clockOffset)) / 1000));
}
