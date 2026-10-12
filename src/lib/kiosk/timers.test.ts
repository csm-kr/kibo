import { describe, expect, it } from "vitest";
import type { Session, SessionStatus } from "@/types/session";
import { doneCountdown, idleWarning, phonePaused, staffBannerVisible } from "./timers";

const T = 1_000_000_000_000;

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

describe("idleWarning", () => {
  it("is hidden more than 60 s before expiry", () => {
    expect(idleWarning(session("ordering", { expiresAt: T + 61_000 }), T, 0)).toEqual({ show: false, secondsLeft: 61 });
  });

  it("shows in the last 60 s with the seconds left, rounded up", () => {
    expect(idleWarning(session("ordering", { expiresAt: T + 60_000 }), T, 0)).toEqual({ show: true, secondsLeft: 60 });
    expect(idleWarning(session("confirming", { expiresAt: T + 1_500 }), T, 0)).toEqual({ show: true, secondsLeft: 2 });
  });

  it("uses server time (local now + clock offset)", () => {
    // The server is 30 s ahead, so 70 s on the local clock is 40 s on the server's.
    expect(idleWarning(session("ordering", { expiresAt: T + 70_000 }), T, 30_000)).toEqual({ show: true, secondsLeft: 40 });
  });

  it("is hidden once expired (the stream ends the session)", () => {
    expect(idleWarning(session("ordering", { expiresAt: T - 1 }), T, 0)).toEqual({ show: false, secondsLeft: 0 });
  });

  it("is hidden when nobody is ordering: idle attract screen, paid, expired", () => {
    for (const status of ["idle", "paid", "expired"] as const) {
      expect(idleWarning(session(status, { expiresAt: T + 30_000 }), T, 0).show).toBe(false);
    }
  });
});

describe("phonePaused", () => {
  it("is false without a phone", () => {
    expect(phonePaused(session("ordering"), T, 0)).toBe(false);
  });

  it("is false while the phone pinged within 60 s", () => {
    expect(phonePaused(session("ordering", { phoneConnectedAt: T - 300_000, phoneSeenAt: T - 60_000 }), T, 0)).toBe(false);
  });

  it("is true after more than 60 s without a ping", () => {
    expect(phonePaused(session("ordering", { phoneConnectedAt: T - 300_000, phoneSeenAt: T - 60_001 }), T, 0)).toBe(true);
  });

  it("falls back to the connect time when the phone never pinged", () => {
    expect(phonePaused(session("connected", { phoneConnectedAt: T - 61_000, phoneSeenAt: null }), T, 0)).toBe(true);
  });

  it("uses server time", () => {
    expect(phonePaused(session("ordering", { phoneConnectedAt: T - 100_000, phoneSeenAt: T - 50_000 }), T, 20_000)).toBe(true);
  });

  it("is false after payment or expiry, when the phone no longer matters", () => {
    for (const status of ["paid", "expired"] as const) {
      expect(phonePaused(session(status, { phoneConnectedAt: T - 300_000, phoneSeenAt: T - 200_000 }), T, 0)).toBe(false);
    }
  });
});

describe("staffBannerVisible", () => {
  it("is false when staff was not called", () => {
    expect(staffBannerVisible(session("ordering"), T, 0)).toBe(false);
  });

  it("shows for 60 s after the call", () => {
    const s = session("ordering", { staffCalled: { reasonCode: "user_request", at: T - 59_999 } });
    expect(staffBannerVisible(s, T, 0)).toBe(true);
    expect(staffBannerVisible(s, T + 2, 0)).toBe(false);
  });

  it("shows for a call stamped slightly ahead of the local clock", () => {
    const s = session("ordering", { staffCalled: { reasonCode: "stuck", at: T + 2_000 } });
    expect(staffBannerVisible(s, T, 0)).toBe(true);
  });

  it("uses server time", () => {
    const s = session("ordering", { staffCalled: { reasonCode: "stuck", at: T - 50_000 } });
    expect(staffBannerVisible(s, T, 20_000)).toBe(false);
  });
});

describe("doneCountdown", () => {
  it("counts 10 s down from the start, rounded up", () => {
    expect(doneCountdown(T, T, 0)).toBe(10);
    expect(doneCountdown(T, T + 100, 0)).toBe(10);
    expect(doneCountdown(T, T + 9_001, 0)).toBe(1);
  });

  it("stops at 0", () => {
    expect(doneCountdown(T, T + 10_000, 0)).toBe(0);
    expect(doneCountdown(T, T + 60_000, 0)).toBe(0);
  });

  it("uses server time", () => {
    expect(doneCountdown(T, T, 4_000)).toBe(6);
  });

  it("never shows more than 10 s when the clock offset runs behind the server", () => {
    expect(doneCountdown(T + 600, T, 0)).toBe(10);
  });
});
