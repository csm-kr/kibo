import type { Session } from "@/types/session";

export type PhoneScreenId =
  | "connecting"
  | "inapp"
  | "start"
  | "mic"
  | "dine"
  | "talk"
  | "confirm"
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

/** Which phone screen to show (docs/UX.md screen map P1–P7). The session status decides; local flags fill the gaps. */
export function phoneScreen(session: Session | null, local: PhoneLocal): PhoneScreenId {
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
      return "confirm";
    case "paying":
      return "pay";
    case "paid":
      return local.doneDismissed ? "ended" : "done";
    case "expired":
      return "ended";
  }
}
