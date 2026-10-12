import type { Session } from "@/types/session";

export type KioskScreenId = "attract" | "dine" | "menu" | "review" | "payment" | "done";

/** Kiosk-only state that the session does not hold. */
export interface KioskLocal {
  /** "Order by touch" was tapped on this kiosk for the current session. */
  touchStarted: boolean;
}

/** Which kiosk screen to show. The session status decides; local state only fills the gaps it leaves. */
export function kioskScreen(session: Session | null, local: KioskLocal): KioskScreenId {
  if (!session) return "attract";
  switch (session.status) {
    case "idle":
      // Shows the dine question right away instead of waiting for startTouch to come back.
      return local.touchStarted ? "dine" : "attract";
    case "connected":
      return "dine";
    case "ordering":
      // A phone can add items before the dine option (requestCheckout asks for it later).
      return local.touchStarted && session.dineOption === null && session.cart.length === 0 ? "dine" : "menu";
    case "confirming":
      return "review";
    case "paying":
      return "payment";
    case "paid":
      return "done";
    case "expired":
      return "attract";
  }
}
