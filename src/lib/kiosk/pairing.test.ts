import { describe, expect, it } from "vitest";
import type { CartLine, Session, SessionStatus } from "@/types/session";
import { orderLine, phoneLink } from "./pairing";

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
