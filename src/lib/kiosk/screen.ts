import type { KioskData } from "@/types/menu";
import type { Session } from "@/types/session";

export type KioskScreenId = "attract" | "dine" | "menu" | "review" | "payment" | "done";

/** Kiosk-only state that the session does not hold. */
export interface KioskLocal {
  /** "Order by touch" was tapped on this kiosk for the current session. */
  touchStarted: boolean;
}

/**
 * Which kiosk screen to show. The session status decides; local state only fills the gaps it leaves.
 * A kiosk without dine options (tickets) has no K2 and goes straight to the menu.
 */
export function kioskScreen(
  session: Session | null,
  local: KioskLocal,
  kiosk: Pick<KioskData, "dineOptions">,
): KioskScreenId {
  if (!session) return "attract";
  const dine = kiosk.dineOptions ? "dine" : "menu";
  switch (session.status) {
    case "idle":
      // Shows the next screen right away instead of waiting for startTouch to come back.
      return local.touchStarted ? dine : "attract";
    case "connected":
      return dine;
    case "ordering": {
      // A phone can add items or ask for the menu (showMenu) before the dine option (requestCheckout asks for it later).
      const nothingYet = session.dineOption === null && session.cart.length === 0 && session.screen.at === undefined;
      return local.touchStarted && nothingYet ? dine : "menu";
    }
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

/**
 * The standalone kiosk's [처음으로] (I-048): offered on K2 and K3 (and so under K4's sheet), never once checkout
 * started. With an empty cart it goes back at once; with items it asks first. Null: not offered.
 */
export function startOverStep(screen: KioskScreenId, session: Session | null): "now" | "ask" | null {
  if (!session || (screen !== "dine" && screen !== "menu")) return null;
  return session.cart.length > 0 ? "ask" : "now";
}
