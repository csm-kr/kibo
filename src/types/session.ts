import type { Variant } from "./menu";

export type Source = "voice" | "text" | "button" | "touch";

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

export interface LineChanges {
  qty?: number;
  variant?: Variant;
  selections?: Record<string, string[]>;
}
