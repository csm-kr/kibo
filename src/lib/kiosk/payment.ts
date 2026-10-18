import type { KioskData } from "@/types/menu";
import type { Session } from "@/types/session";

/** A direct kiosk whose data says it takes card and nothing else, so there is no method for the user to choose. */
export function takesCardOnly(kiosk: KioskData): boolean {
  const methods = kiosk.payment?.methods;
  return kiosk.kind !== "learned" && methods !== undefined && methods.length === 1 && methods[0] === "card";
}

/**
 * Whether KIBO has picked 카드 (Card) on the kiosk's payment screen for the user: the phone confirmed (a spoken or
 * typed yes, or the confirm card's tap) on a kiosk that takes card only. The kiosk then opens on its card step, so
 * after the yes the user only inserts the card, and the phone, the AI and the step lines say just that (owner 10-18:
 * "말로만 다 카드결제까지"). A touch confirm keeps the kiosk's own method screen. Paying stays the kiosk's cardAction.
 */
export function kioskPickedCard(kiosk: KioskData, session: Pick<Session, "status" | "confirmedBy">): boolean {
  return session.status === "paying" && session.confirmedBy === "phone" && takesCardOnly(kiosk);
}
