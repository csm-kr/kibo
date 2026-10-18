import { describe, expect, it } from "vitest";
import type { CartLine, Session, SessionStatus } from "@/types/session";
import { getKiosk } from "@/lib/adapters/catalog";
import { kioskScreen, startOverStep } from "./screen";

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
    pendingBridgeCommand: null,
    bridgeStatus: null,
    createdAt: 0,
    lastSeenAt: 0,
    expiresAt: 0,
    ...over,
  };
}

const touch = { touchStarted: true };
const none = { touchStarted: false };
const malo = getKiosk("malo");
const rail = getKiosk("airport_rail");

describe("kioskScreen", () => {
  it("shows attract while there is no session yet", () => {
    expect(kioskScreen(null, none, malo)).toBe("attract");
    expect(kioskScreen(null, touch, malo)).toBe("attract");
  });

  it("idle: attract, or dine once touch was tapped (before the server answers)", () => {
    expect(kioskScreen(session("idle"), none, malo)).toBe("attract");
    expect(kioskScreen(session("idle"), touch, malo)).toBe("dine");
  });

  // A voice "show me the drinks" (showMenu) is a request for the menu, even on a kiosk someone touched first.
  it("ordering after showMenu: the menu, even when touch was tapped and nothing is chosen yet", () => {
    expect(kioskScreen(session("ordering", { screen: { category: "drink", at: 1 } }), touch, malo)).toBe("menu");
  });

  it("connected (phone claimed the QR): dine", () => {
    expect(kioskScreen(session("connected"), none, malo)).toBe("dine");
    expect(kioskScreen(session("connected"), touch, malo)).toBe("dine");
  });

  it("ordering by touch without dine option and empty cart: dine", () => {
    expect(kioskScreen(session("ordering"), touch, malo)).toBe("dine");
  });

  it("ordering with a dine option: menu", () => {
    expect(kioskScreen(session("ordering", { dineOption: "eat_in" }), touch, malo)).toBe("menu");
    expect(kioskScreen(session("ordering", { dineOption: "take_out" }), none, malo)).toBe("menu");
  });

  it("ordering with a cart but no dine option (the phone added first): menu", () => {
    expect(kioskScreen(session("ordering", { cart: [line] }), touch, malo)).toBe("menu");
    expect(kioskScreen(session("ordering", { cart: [line] }), none, malo)).toBe("menu");
  });

  it("ordering not started by touch here (phone, or a reload): menu", () => {
    expect(kioskScreen(session("ordering"), none, malo)).toBe("menu");
  });

  it("maps the checkout states", () => {
    expect(kioskScreen(session("confirming"), none, malo)).toBe("review");
    expect(kioskScreen(session("paying"), none, malo)).toBe("payment");
    expect(kioskScreen(session("paid"), none, malo)).toBe("done");
  });

  it("expired: attract while a new session is created", () => {
    expect(kioskScreen(session("expired"), touch, malo)).toBe("attract");
  });

  it("a kiosk without dine options (tickets) never shows the dine screen", () => {
    const s = (status: SessionStatus) => session(status, { kioskId: "airport_rail" });
    expect(rail.dineOptions).toBeUndefined();
    expect(kioskScreen(s("idle"), none, rail)).toBe("attract");
    expect(kioskScreen(s("idle"), touch, rail)).toBe("menu");
    expect(kioskScreen(s("connected"), none, rail)).toBe("menu");
    expect(kioskScreen(s("ordering"), touch, rail)).toBe("menu");
    expect(kioskScreen(s("confirming"), none, rail)).toBe("review");
  });
});

describe("startOverStep ([처음으로], I-048)", () => {
  it("is offered only before checkout: K2 and K3 (K4 is a sheet on K3)", () => {
    expect(startOverStep("dine", session("ordering"))).toBe("now");
    expect(startOverStep("menu", session("ordering"))).toBe("now");
    for (const screen of ["attract", "review", "payment", "done"] as const) {
      expect(startOverStep(screen, session("ordering", { cart: [line] })), screen).toBeNull();
    }
    expect(startOverStep("menu", null)).toBeNull();
  });

  it("asks first when the cart has items", () => {
    expect(startOverStep("menu", session("ordering", { cart: [line] }))).toBe("ask");
    expect(startOverStep("menu", session("ordering", { cart: [] }))).toBe("now");
  });
});
