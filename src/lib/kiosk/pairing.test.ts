import { describe, expect, it } from "vitest";
import type { CartLine, Session, SessionStatus } from "@/types/session";
import { getKiosk } from "@/lib/adapters/catalog";
import { changeLine, kioskStep, orderLine, phoneLink } from "./pairing";

const T = 1_000_000_000_000;
const LINE: CartLine = { lineId: "a1", itemId: "cheese_burger", variant: "set", qty: 2, selections: {}, unitPrice: 6900 };

function session(status: SessionStatus, over: Partial<Session> = {}): Session {
  return {
    sessionId: "s".repeat(22),
    kioskId: "malo",
    demo: false,
    status,
    dineOption: null,
    cart: [],
    total: 0,
    cartVersion: 0,
    screen: {},
    lastChange: null,
    pendingChoice: null,
    staffCalled: null,
    undoStack: [],
    recentCommandIds: [],
    checkoutUtteranceSeq: null,
    checkoutAt: null,
    upsellOffered: false,
    orderNumber: null,
    paidAt: null,
    phoneConnectedAt: null,
    phoneSeenAt: null,
    pendingBridgeCommand: null,
    bridgeStatus: null,
    createdAt: T - 60_000,
    lastSeenAt: T,
    expiresAt: T + 600_000,
    ...over,
  };
}

describe("phoneLink", () => {
  it("waits until a phone claims the session, and again after a new QR (phoneConnectedAt null)", () => {
    expect(phoneLink(null, T, 0)).toBe("waiting");
    expect(phoneLink(session("idle"), T, 0)).toBe("waiting");
    expect(phoneLink(session("ordering"), T, 0)).toBe("waiting");
  });

  it("is connected while the phone pings, paused after 60 s without one", () => {
    const s = session("ordering", { phoneConnectedAt: T - 120_000, phoneSeenAt: T - 30_000 });
    expect(phoneLink(s, T, 0)).toBe("connected");
    expect(phoneLink(s, T + 31_000, 0)).toBe("paused");
  });
});

describe("orderLine", () => {
  it("counts quantities, not lines, and shows the total in won", () => {
    const s = session("ordering", { cart: [LINE, { ...LINE, lineId: "b2", qty: 1 }], total: 20700 });
    expect(orderLine(s, "food")).toBe("Ordering · 3 items · ₩20,700");
    expect(orderLine(session("ordering", { cart: [{ ...LINE, qty: 1 }], total: 6900 }), "food")).toBe("Ordering · 1 item · ₩6,900");
  });

  it("names each step of the order", () => {
    expect(orderLine(session("connected"), "food")).toBe("Nothing ordered yet");
    expect(orderLine(session("confirming", { cart: [LINE], total: 13800 }), "food")).toBe("Checking the order · 2 items · ₩13,800");
    expect(orderLine(session("paying", { cart: [LINE], total: 13800 }), "food")).toBe("Paying at the kiosk · ₩13,800");
    expect(orderLine(session("paid", { orderNumber: 123 }), "food")).toBe("Paid · order number 123");
    expect(orderLine(session("expired"), "food")).toBe("This order has ended");
  });

  it("a ticket machine says tickets, never order (R-007)", () => {
    const lines = [
      orderLine(session("connected"), "ticket"),
      orderLine(session("ordering", { cart: [LINE], total: 21000 }), "ticket"),
      orderLine(session("confirming", { cart: [LINE], total: 21000 }), "ticket"),
      orderLine(session("paid", { orderNumber: 45 }), "ticket"),
      orderLine(session("expired"), "ticket"),
    ];
    expect(lines[1]).toBe("Buying · 2 tickets · ₩21,000");
    expect(lines[3]).toBe("Paid · reference number 45");
    for (const l of lines) expect(l.toLowerCase()).not.toContain("order");
  });
});

describe("changeLine", () => {
  it("before the review, says who made the last cart change", () => {
    const at = T;
    expect(changeLine(session("ordering"))).toBeNull();
    expect(changeLine(session("ordering", { lastChange: { lineId: "a1", kind: "add", source: "voice", at } }))).toBe("Last change: by the AI");
    expect(changeLine(session("ordering", { lastChange: { lineId: "a1", kind: "add", source: "button", at } }))).toBe("Last change: on the phone");
    expect(changeLine(session("ordering", { lastChange: { lineId: "a1", kind: "add", source: "touch", at } }))).toBe("Last change: on the kiosk");
  });

  it("from the review on, never credits the AI: only a person confirms and the kiosk takes the card", () => {
    const ai = { lineId: "a1", kind: "add" as const, source: "voice" as const, at: T };
    expect(changeLine(session("confirming", { lastChange: ai }))).toBe("Waiting for you to confirm");
    expect(changeLine(session("paying", { lastChange: ai }))).toBe("Confirmed by you");
    expect(changeLine(session("paid", { lastChange: ai, orderNumber: 860 }))).toBe("Paid at the kiosk · confirmed by you");
    expect(changeLine(session("expired", { lastChange: ai }))).toBeNull();
  });
});

describe("kioskStep", () => {
  const malo = getKiosk("malo");
  const rail = getKiosk("airport_rail");

  it("mirrors the Korean kiosk's payment step in English, with the kiosk's own button labels", () => {
    expect(kioskStep(malo, session("paying"))).toBe(
      "Kiosk: payment. Tap 카드 (Card), then 카드 넣기 (Insert card). Demo only, no money is charged.",
    );
    expect(kioskStep(malo, session("confirming"))).toBe("Kiosk: order review. Nothing is paid until you confirm.");
    expect(kioskStep(malo, session("paid", { orderNumber: 860 }))).toBe("Kiosk: receipt question, then the order number.");
  });

  it("says nothing before the review, and a ticket machine says tickets (R-007)", () => {
    expect(kioskStep(malo, session("ordering"))).toBeNull();
    expect(kioskStep(rail, session("confirming"))).toBe("Kiosk: ticket review. Nothing is paid until you confirm.");
    expect(kioskStep(rail, session("paid", { orderNumber: 45 }))).toBe("Kiosk: receipt question, then the reference number.");
  });

  it("once the kiosk shows the number, says so instead of the receipt question it has passed (#1 item 13)", () => {
    expect(kioskStep(malo, session("paid", { orderNumber: 860 }), true)).toBe(
      "Kiosk: order number. The order is done; no money was charged.",
    );
    const ticket = kioskStep(rail, session("paid", { orderNumber: 45 }), true);
    expect(ticket).toBe("Kiosk: reference number. The purchase is done; no money was charged.");
    expect(ticket?.toLowerCase()).not.toContain("order");
    // Before the payment the number cannot be on screen, so the flag changes nothing there.
    expect(kioskStep(malo, session("paying"), true)).toBe(kioskStep(malo, session("paying")));
  });

  it("a learned kiosk has no KIBO payment step: the user pays on the kiosk itself", () => {
    expect(kioskStep(getKiosk("doughhouse"), session("confirming"))).toBeNull();
  });
});
