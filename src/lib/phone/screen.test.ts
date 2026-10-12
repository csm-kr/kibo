import { describe, expect, it } from "vitest";
import type { Session, SessionStatus } from "@/types/session";
import { BRIDGE_SLOW_MS, bridgeNotice, phoneScreen, type PhoneLocal } from "./screen";

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
    phoneConnectedAt: 1,
    phoneSeenAt: 1,
    pendingBridgeCommand: null,
    bridgeStatus: null,
    createdAt: 0,
    lastSeenAt: 0,
    expiresAt: 0,
    ...over,
  };
}

const fresh: PhoneLocal = { claimError: null, startSeen: false, doneDismissed: false, micHint: false, inAppHold: false };
const started: PhoneLocal = { ...fresh, startSeen: true };

describe("phoneScreen", () => {
  it("shows the claim errors before anything else", () => {
    expect(phoneScreen(session("ordering"), { ...started, claimError: "taken" })).toBe("taken");
    expect(phoneScreen(null, { ...fresh, claimError: "taken" })).toBe("taken");
    expect(phoneScreen(null, { ...fresh, claimError: "gone" })).toBe("ended");
  });

  it("waits for the session", () => {
    expect(phoneScreen(null, fresh)).toBe("connecting");
    expect(phoneScreen(session("idle"), started)).toBe("connecting");
  });

  it("connected: the start screen, then the dine question", () => {
    expect(phoneScreen(session("connected"), fresh)).toBe("start");
    expect(phoneScreen(session("connected"), started)).toBe("dine");
  });

  it("ordering goes straight to talking, also when scanned mid-order", () => {
    expect(phoneScreen(session("ordering"), fresh)).toBe("talk");
    expect(phoneScreen(session("ordering", { dineOption: "eat_in" }), started)).toBe("talk");
  });

  it("follows confirming, paying and paid", () => {
    expect(phoneScreen(session("confirming"), fresh)).toBe("confirm");
    expect(phoneScreen(session("paying"), fresh)).toBe("pay");
    expect(phoneScreen(session("paid", { orderNumber: 123 }), fresh)).toBe("done");
  });

  it("keeps the order number until the user dismisses it", () => {
    expect(phoneScreen(session("paid"), { ...started, doneDismissed: true })).toBe("ended");
  });

  it("expired ends the order", () => {
    expect(phoneScreen(session("expired"), started)).toBe("ended");
  });

  it("P1: the microphone hint comes after start and before the dine question or talking", () => {
    const hint: PhoneLocal = { ...started, micHint: true };
    expect(phoneScreen(session("connected"), { ...fresh, micHint: true })).toBe("start");
    expect(phoneScreen(session("connected"), hint)).toBe("mic");
    // Scanned mid-order (Flow B): no start screen, the hint first.
    expect(phoneScreen(session("ordering"), { ...fresh, micHint: true })).toBe("mic");
    expect(phoneScreen(session("confirming"), hint)).toBe("confirm");
  });

  it("P1 in an in-app browser: the warning before the claim, so the copied link still claims", () => {
    expect(phoneScreen(null, { ...fresh, inAppHold: true })).toBe("inapp");
    expect(phoneScreen(null, { ...fresh, inAppHold: true, claimError: "gone" })).toBe("ended");
  });

  it("a learned kiosk's review is its own screen: the user pays on the kiosk, never on the phone", () => {
    expect(phoneScreen(session("confirming", { kioskId: "doughhouse" }), started, true)).toBe("confirmLearned");
    expect(phoneScreen(session("ordering", { kioskId: "doughhouse" }), started, true)).toBe("talk");
    expect(phoneScreen(session("confirming"), started, false)).toBe("confirm");
  });
});

describe("bridgeNotice (learned kiosks)", () => {
  const T = 1_000_000;
  const pending = (at: number): Partial<Session> => ({
    pendingBridgeCommand: { commandId: "c1", type: "addToCart", args: { itemId: "cola", qty: 1, selections: {} }, source: "voice", at },
  });

  it("nothing while the kiosk is idle or the last replay matched", () => {
    expect(bridgeNotice(session("ordering"), T)).toBeNull();
    expect(bridgeNotice(session("ordering", { bridgeStatus: { lastOk: true, at: T - 10 } }), T)).toBeNull();
  });

  it("pending: the kiosk is entering it; after 15 s without a report, check the kiosk screen", () => {
    expect(bridgeNotice(session("ordering", pending(T - 1000)), T)).toBe("pending");
    expect(bridgeNotice(session("ordering", pending(T - BRIDGE_SLOW_MS + 1)), T)).toBe("pending");
    expect(bridgeNotice(session("ordering", pending(T - BRIDGE_SLOW_MS)), T)).toBe("slow");
    // Session times are server time: a phone clock 5 s behind still waits 15 s of server time.
    expect(bridgeNotice(session("ordering", pending(T - 11_000)), T - 5000, 5000)).toBe("pending");
    expect(bridgeNotice(session("ordering", pending(T - 16_000)), T - 5000, 5000)).toBe("slow");
  });

  it("mismatch: the last replay failed, or staff was called for a mismatch after the last good replay", () => {
    expect(bridgeNotice(session("ordering", { bridgeStatus: { lastOk: false, at: T - 10 } }), T)).toBe("mismatch");
    const mismatch = { staffCalled: { reasonCode: "learned_mismatch" as const, at: T - 100 } };
    expect(bridgeNotice(session("ordering", mismatch), T)).toBe("mismatch");
    expect(bridgeNotice(session("ordering", { ...mismatch, bridgeStatus: { lastOk: true, at: T - 50 } }), T)).toBeNull();
    // A user's own staff call is not a mismatch.
    expect(bridgeNotice(session("ordering", { staffCalled: { reasonCode: "user_request", at: T } }), T)).toBeNull();
  });

  it("a new change waiting for the kiosk replaces the old mismatch notice", () => {
    const s = session("ordering", { ...pending(T - 500), bridgeStatus: { lastOk: false, at: T - 1000 } });
    expect(bridgeNotice(s, T)).toBe("pending");
  });
});
