import type { Session } from "@/types/session";

export const SESSION_TTL_MS = 10 * 60 * 1000;

export function newSession(p: { sessionId: string; kioskId: string; demo: boolean; now: number }): Session {
  return {
    sessionId: p.sessionId,
    kioskId: p.kioskId,
    demo: p.demo,
    status: "idle",
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
    phoneWorkingAt: null,
    pendingBridgeCommand: null,
    bridgeStatus: null,
    createdAt: p.now,
    lastSeenAt: p.now,
    expiresAt: p.now + SESSION_TTL_MS,
  };
}
