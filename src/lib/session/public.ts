import type { Session } from "@/types/session";

/**
 * Copies the Session fields one by one, so anything else on the stored object (a field meant for
 * sessionSecrets, a Firestore extra) never reaches a client. TypeScript flags a new Session field here.
 */
export function toPublicSession(s: Session): Session {
  return {
    sessionId: s.sessionId,
    kioskId: s.kioskId,
    demo: s.demo,
    status: s.status,
    dineOption: s.dineOption,
    cart: s.cart,
    total: s.total,
    cartVersion: s.cartVersion,
    screen: s.screen,
    lastChange: s.lastChange,
    pendingChoice: s.pendingChoice,
    staffCalled: s.staffCalled,
    undoStack: s.undoStack,
    recentCommandIds: s.recentCommandIds,
    checkoutUtteranceSeq: s.checkoutUtteranceSeq,
    checkoutAt: s.checkoutAt,
    ...(s.confirmedBy ? { confirmedBy: s.confirmedBy } : {}),
    upsellOffered: s.upsellOffered,
    orderNumber: s.orderNumber,
    paidAt: s.paidAt,
    phoneConnectedAt: s.phoneConnectedAt,
    phoneSeenAt: s.phoneSeenAt,
    phoneWorkingAt: s.phoneWorkingAt ?? null,
    pendingBridgeCommand: s.pendingBridgeCommand,
    bridgeStatus: s.bridgeStatus,
    createdAt: s.createdAt,
    lastSeenAt: s.lastSeenAt,
    expiresAt: s.expiresAt,
  };
}
