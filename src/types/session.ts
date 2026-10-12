import type { ChoiceRef, TemplateId } from "@/lib/commands/errors";
import type { Variant } from "./menu";

export type Source = "voice" | "text" | "button" | "touch";

export type SessionStatus = "idle" | "connected" | "ordering" | "confirming" | "paying" | "paid" | "expired";
export type DineOption = "eat_in" | "take_out";
export type StaffReason = "unknown_info" | "user_request" | "stuck" | "learned_mismatch";
export type ChangeKind = "add" | "update" | "remove" | "undo" | "clear";
export type Actor = "phone" | "kiosk";

/** Public: anyone holding the session id can read it, so it holds ids and codes only, never free text. */
export interface Session {
  sessionId: string;
  kioskId: string;
  demo: boolean;
  status: SessionStatus;
  dineOption: DineOption | null;
  cart: CartLine[];
  total: number;
  cartVersion: number;
  screen: { category?: string; itemId?: string };
  lastChange: { lineId: string | null; kind: ChangeKind; source: Source; at: number } | null;
  pendingChoice: { templateId: TemplateId; choices: ChoiceRef[] } | null;
  staffCalled: { reasonCode: StaffReason; at: number } | null;
  /** Last 5 carts, newest last. */
  undoStack: CartLine[][];
  /** Last 30. */
  recentCommandIds: string[];
  checkoutUtteranceSeq: number | null;
  checkoutAt: number | null;
  upsellOffered: boolean;
  orderNumber: number | null;
  paidAt: number | null;
  phoneConnectedAt: number | null;
  phoneSeenAt: number | null;
  /** Learned kiosks: the one cart change waiting for the bridge to replay it; always null on a direct kiosk. */
  pendingBridgeCommand: PendingBridgeCommand | null;
  /** Learned kiosks: the bridge's last result, for the phone's "Please check the kiosk screen". */
  bridgeStatus: { lastOk: boolean; at: number } | null;
  /** Epoch ms. */
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

export interface CartLine {
  lineId: string;
  itemId: string;
  variant: Variant;
  qty: number;
  /** groupId → optionIds; groups with no selection are omitted. */
  selections: Record<string, string[]>;
  unitPrice: number;
}

export interface LineInput {
  itemId: string;
  variant?: Variant;
  qty?: number;
  selections?: Record<string, string[]>;
}

/** Ids and catalog values only; `lineIndex` (remove) is the line's position, which the bridge clicks by. */
export type BridgeChange =
  | { type: "setDineOption"; args: { option: DineOption } }
  | { type: "addToCart"; args: LineInput }
  | { type: "removeFromCart"; args: { lineId: string }; lineIndex: number };

export type PendingBridgeCommand = BridgeChange & { commandId: string; source: Source; at: number };

export interface LineChanges {
  qty?: number;
  variant?: Variant;
  selections?: Record<string, string[]>;
}
