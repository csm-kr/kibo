import type { KioskDomain } from "@/types/menu";
import type { Session } from "@/types/session";
import { formatWon } from "./menu";
import { phonePaused } from "./timers";

// The KIBO pairing panel beside a landscape kiosk (/kiosk, /demo "Use my phone"): what the phone is doing, read only
// from the public session. English (judges and laptop demos); ticket machines use ticket words (R-007).

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
