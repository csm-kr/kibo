import { kt, type KioskTextKey } from "@/lib/i18n/kiosk";
import type { KioskData, KioskDomain } from "@/types/menu";
import type { Session } from "@/types/session";
import { formatWon } from "./menu";
import { kioskScreen } from "./screen";
import { phonePaused } from "./timers";

// The KIBO pairing panel beside a landscape kiosk (/kiosk; /demo says the step in its caption row): what the phone
// is doing, read only from the public session. English (judges and laptop demos); ticket machines use ticket words
// (R-007).

export type PhoneLink = "waiting" | "connected" | "paused";

/** No phone yet (or a new QR released it), a phone pinging, or one silent for over 60 s. */
export function phoneLink(session: Session | null, now: number, clockOffset: number): PhoneLink {
  if (!session || session.phoneConnectedAt === null) return "waiting";
  return phonePaused(session, now, clockOffset) ? "paused" : "connected";
}

/** One status line: the order's step, the item count (quantities) and the total. */
export function orderLine(session: Session, domain: KioskDomain): string {
  const ticket = domain === "ticket";
  const n = session.cart.reduce((sum, l) => sum + l.qty, 0);
  const count = `${n} ${ticket ? "ticket" : "item"}${n === 1 ? "" : "s"}`;
  const total = formatWon(session.total, "en");
  switch (session.status) {
    case "idle":
    case "connected":
    case "ordering":
      if (n === 0) return ticket ? "No tickets chosen yet" : "Nothing ordered yet";
      return `${ticket ? "Buying" : "Ordering"} · ${count} · ${total}`;
    case "confirming":
      return `${ticket ? "Checking the tickets" : "Checking the order"} · ${count} · ${total}`;
    case "paying":
      return `Paying at the kiosk · ${total}`;
    case "paid":
      return `Paid · ${ticket ? "reference" : "order"} number ${session.orderNumber ?? ""}`.trim();
    case "expired":
      return ticket ? "This purchase has ended" : "This order has ended";
  }
}

/**
 * Who moved the order last. From the review on only a person can move it (a tap or a new "yes", then the kiosk's
 * card), so it never says "by the AI" there: `lastChange` records cart changes only and would still name the AI.
 */
export function changeLine(session: Session): string | null {
  switch (session.status) {
    case "confirming":
      return "Waiting for you to confirm";
    case "paying":
      return "Confirmed by you";
    case "paid":
      return "Paid at the kiosk · confirmed by you";
    case "expired":
      return null;
  }
  const source = session.lastChange?.source;
  if (!source) return null;
  return `Last change: ${source === "voice" || source === "text" ? "by the AI" : source === "button" ? "on the phone" : "on the kiosk"}`;
}

/** "카드 (Card)": the Korean kiosk's own label, then what it means. */
const both = (key: KioskTextKey) => `${kt(key, "ko")} (${kt(key, "en")})`;

/** The payment step's line in the pairing panel. */
export const PAYMENT_STEP = `Kiosk: payment. Tap ${both("payCard")}, then ${both("insertCardButton")}. Demo only, no money is charged.`;

/**
 * The kiosk's current step in English, for KIBO's side of the screen (/demo caption, pairing panel): the kiosk itself
 * stays Korean. Learned kiosks have none: the user reviews and pays on the kiosk page. `numberShown`: the kiosk has
 * moved past its receipt question to the order number, which only the kiosk screen knows (#1 item 13).
 */
export function kioskStep(kiosk: KioskData, session: Session, numberShown = false): string | null {
  if (kiosk.kind === "learned") return null;
  const ticket = kiosk.domain === "ticket";
  switch (session.status) {
    case "confirming":
      return `Kiosk: ${ticket ? "ticket" : "order"} review. Nothing is paid until you confirm.`;
    case "paying":
      return PAYMENT_STEP;
    case "paid":
      if (numberShown)
        return ticket
          ? "Kiosk: reference number. The purchase is done; no money was charged."
          : "Kiosk: order number. The order is done; no money was charged.";
      return `Kiosk: receipt question, then the ${ticket ? "reference" : "order"} number.`;
    default:
      return null;
  }
}

/**
 * /demo's step line, in the kiosk column's caption row after "Kiosk · unchanged" (#1 E): every step from D2's dine
 * question to the order number (#1 item 19, I-248), as "<step>: <what to do or know>." in two short lines at most, so
 * the row keeps its 56px and the kiosk under it never moves. The screen comes from kioskScreen, so a phone's add
 * before the dine option reads as the menu, as the kiosk shows it. `numberShown`: past the receipt question (#1 item 13).
 * `ownPhone`: the judge's own phone, the /demo default, where the laptop shows only the kiosk, so until a phone claims
 * the order the line says to scan the QR (on the kiosk's own screen; beside a learned page, on KIBO's panel).
 */
export function demoKioskStep(kiosk: KioskData, session: Session, numberShown: boolean, ownPhone = false): string | null {
  if (ownPhone && session.status === "idle") return "Start: scan the QR with your phone's camera.";
  if (kiosk.kind === "learned") return null;
  const ticket = kiosk.domain === "ticket";
  const screen = kioskScreen(session, { touchStarted: false }, kiosk);
  if (screen === "dine") return "Eat here or take out: answer on either screen.";
  if (screen === "menu") return ticket ? "Tickets: yours show at the bottom." : "Menu: your order shows at the bottom.";
  switch (session.status) {
    case "confirming":
      return `${ticket ? "Ticket" : "Order"} review: nothing is paid until you confirm.`;
    case "paying":
      return `Payment: tap ${both("payCard")}, then ${both("insertCardButton")}.`;
    case "paid":
      if (numberShown) return `${ticket ? "Reference" : "Order"} number: done, no money was charged.`;
      return `Receipt question: the ${ticket ? "reference" : "order"} number is next.`;
    default:
      return null;
  }
}
