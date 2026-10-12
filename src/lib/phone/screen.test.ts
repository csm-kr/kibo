import { describe, expect, it } from "vitest";
import type { Session, SessionStatus } from "@/types/session";
import { phoneScreen, type PhoneLocal } from "./screen";

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
});
