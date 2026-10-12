import { describe, expect, it } from "vitest";
import type { CartLine, Session, SessionStatus } from "@/types/session";
import { kioskScreen } from "./screen";

const line: CartLine = { lineId: "l1", itemId: "burger_cheese", variant: "single", qty: 1, selections: {}, unitPrice: 5000 };

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
    createdAt: 0,
    lastSeenAt: 0,
    expiresAt: 0,
    ...over,
  };
}

const touch = { touchStarted: true };
const none = { touchStarted: false };

describe("kioskScreen", () => {
  it("shows attract while there is no session yet", () => {
    expect(kioskScreen(null, none)).toBe("attract");
    expect(kioskScreen(null, touch)).toBe("attract");
  });

  it("idle: attract, or dine once touch was tapped (before the server answers)", () => {
    expect(kioskScreen(session("idle"), none)).toBe("attract");
    expect(kioskScreen(session("idle"), touch)).toBe("dine");
  });

  it("connected (phone claimed the QR): dine", () => {
    expect(kioskScreen(session("connected"), none)).toBe("dine");
    expect(kioskScreen(session("connected"), touch)).toBe("dine");
  });

  it("ordering by touch without dine option and empty cart: dine", () => {
    expect(kioskScreen(session("ordering"), touch)).toBe("dine");
  });

  it("ordering with a dine option: menu", () => {
    expect(kioskScreen(session("ordering", { dineOption: "eat_in" }), touch)).toBe("menu");
    expect(kioskScreen(session("ordering", { dineOption: "take_out" }), none)).toBe("menu");
  });

  it("ordering with a cart but no dine option (the phone added first): menu", () => {
    expect(kioskScreen(session("ordering", { cart: [line] }), touch)).toBe("menu");
    expect(kioskScreen(session("ordering", { cart: [line] }), none)).toBe("menu");
  });

  it("ordering not started by touch here (phone, or a reload): menu", () => {
    expect(kioskScreen(session("ordering"), none)).toBe("menu");
  });

  it("maps the checkout states", () => {
    expect(kioskScreen(session("confirming"), none)).toBe("review");
    expect(kioskScreen(session("paying"), none)).toBe("payment");
    expect(kioskScreen(session("paid"), none)).toBe("done");
  });

  it("expired: attract while a new session is created", () => {
    expect(kioskScreen(session("expired"), touch)).toBe("attract");
  });
});
