import type { Session } from "@/types/session";

export type PhoneScreenId =
  | "connecting"
  | "inapp"
  | "start"
  | "mic"
  | "dine"
  | "talk"
  | "confirm"
  | "confirmLearned"
  | "pay"
  | "done"
  | "ended"
  | "taken";

/** Phone-only state that the session does not hold. */
export interface PhoneLocal {
  /** The claim was refused: another phone holds the session, or the session is over. */
  claimError: "taken" | "gone" | null;
  /** The user tapped [Start] on the start screen. */
  startSeen: boolean;
  /** The user closed the order number with [Done]. */
  doneDismissed: boolean;
  /** P1: this browser has not seen the microphone hint yet. */
  micHint: boolean;
  /** An in-app browser: the claim waits until the user copies the link or chooses to stay. */
  inAppHold: boolean;
}

/**
 * Which phone screen to show (docs/UX.md screen map P1–P7). The session status decides; local flags fill the gaps.
 * A learned kiosk's order ends at its review: the user pays on the kiosk itself, so P4 there has no pay button.
 */
export function phoneScreen(session: Session | null, local: PhoneLocal, learned = false): PhoneScreenId {
  if (local.claimError === "taken") return "taken";
  if (local.claimError === "gone") return "ended";
  if (local.inAppHold) return "inapp";
  if (!session) return "connecting";
  switch (session.status) {
    case "idle":
      // The claim moves idle to connected; until that snapshot arrives there is nothing to show yet.
      return "connecting";
    case "connected":
      // No dine option yet (the first one moves to ordering). The dine screen also lets the user just talk.
      if (!local.startSeen) return "start";
      return local.micHint ? "mic" : "dine";
    case "ordering":
      // Scanned mid-order (Flow B) or the dine option is set: straight to talking, after the mic hint.
      return local.micHint ? "mic" : "talk";
    case "confirming":
      return learned ? "confirmLearned" : "confirm";
    case "paying":
      return "pay";
    case "paid":
      return local.doneDismissed ? "ended" : "done";
    case "expired":
      return "ended";
  }
}

/** After this long without the bridge's report, the phone asks the user to look at the kiosk (ARCHITECTURE "Commands and actors"). */
export const BRIDGE_SLOW_MS = 15_000;

/** What a learned kiosk is doing with the user's last change, for the phone's status line. */
export type BridgeNotice = "pending" | "slow" | "mismatch";

/** `now` is the phone's clock; session times are server time, so `clockOffset` (server minus local) corrects it. */
export function bridgeNotice(session: Session, now: number, clockOffset = 0): BridgeNotice | null {
  const pending = session.pendingBridgeCommand;
  if (pending) return now + clockOffset - pending.at >= BRIDGE_SLOW_MS ? "slow" : "pending";
  const status = session.bridgeStatus;
  if (status && !status.lastOk) return "mismatch";
  // A pending change that timed out on the server calls staff too; a later good replay clears the notice.
  const staff = session.staffCalled;
  const okAt = status?.lastOk ? status.at : -Infinity;
  if (staff?.reasonCode === "learned_mismatch" && staff.at > okAt) return "mismatch";
  return null;
}
