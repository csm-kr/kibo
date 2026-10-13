import { findItem, findOption, groupsFor } from "@/lib/adapters/catalog";
import { unitPriceOf } from "@/lib/commands/cart";
import { kt, variantWord } from "@/lib/i18n/kiosk";
import type { KioskData, KioskDomain, Locale, MenuItem, OptionGroup, Variant } from "@/types/menu";
import type { CartLine } from "@/types/session";

// Pure helpers for the kiosk menu (K3) and product sheet (K4). Names and prices come only from menu data.

/** "4,900원" in Korean, "₩4,900" in English. */
export function formatWon(n: number, locale: Locale): string {
  const digits = n.toLocaleString("en-US");
  return locale === "ko" ? `${digits}원` : `₩${digits}`;
}

/**
 * The price a tile shows: the first variant with its default options, which is what the sheet preselects
 * (a fare shows the adult price, as ticket machines do, I-119).
 */
export function tilePrice(item: MenuItem): number {
  const { variant, price } = item.variants[0];
  let total = price;
  for (const g of groupsFor(item, variant)) {
    for (const id of g.defaultOptionIds) total += findOption(g, id)?.priceDelta ?? 0;
  }
  return total;
}

/** "치즈버거 세트" and "감자튀김 M · 제로콜라 · 피클 빼기": groups in menu order, options in menu order. */
export function lineLabel(k: KioskData, line: CartLine, locale: Locale): { title: string; detail: string } {
  const item = findItem(k, line.itemId);
  if (!item) return { title: "", detail: "" };
  const title = item.variants.length > 1 ? `${item.name[locale]} ${variantWord(line.variant, locale)}` : item.name[locale];
  const names: string[] = [];
  for (const group of groupsFor(item, line.variant)) {
    const chosen = line.selections[group.groupId] ?? [];
    for (const option of group.options) {
      if (chosen.includes(option.optionId)) names.push(option.name[locale]);
    }
  }
  return { title, detail: names.join(" · ") };
}

export interface SheetStep {
  kind: "variant" | "group" | "qty";
  groupId?: string;
  label: string;
  /** 1-based, for "2/4 단계 · 사이드". */
  index: number;
  count: number;
}

/** Groups for the chosen variant; before one is chosen, every group any variant has. */
function sheetGroups(item: MenuItem, variant: Variant | null): OptionGroup[] {
  return variant ? groupsFor(item, variant) : item.optionGroups;
}

/**
 * K4 steps: the variant (only when there are several), then one step per option group in menu order
 * (side, drink, ingredients). The last step also holds the quantity; an item with no choices gets a quantity step.
 */
export function sheetSteps(item: MenuItem, variant: Variant | null, locale: Locale, domain: KioskDomain = "food"): SheetStep[] {
  const steps: Omit<SheetStep, "index" | "count">[] = [];
  if (item.variants.length > 1) steps.push({ kind: "variant", label: kt("stepVariant", locale) });
  for (const g of sheetGroups(item, variant)) steps.push({ kind: "group", groupId: g.groupId, label: g.name[locale] });
  if (steps.length === 0) steps.push({ kind: "qty", label: kt("stepQty", locale, domain) });
  return steps.map((s, i) => ({ ...s, index: i + 1, count: steps.length }));
}

export interface SheetDraft {
  itemId: string;
  variant: Variant | null;
  qty: number;
  selections: Record<string, string[]>;
}

/** Only the groups that apply to the variant, without empty ones: what addToCart accepts. */
export function draftSelections(item: MenuItem, variant: Variant, selections: Record<string, string[]>) {
  const out: Record<string, string[]> = {};
  for (const g of groupsFor(item, variant)) {
    const chosen = (selections[g.groupId] ?? []).filter((id) => findOption(g, id));
    if (chosen.length > 0) out[g.groupId] = chosen;
  }
  return out;
}

/** Preview price only; the server's total is the truth. */
export function sheetPrice(k: KioskData, draft: SheetDraft): number {
  const item = findItem(k, draft.itemId);
  if (!item) return 0;
  const variant = draft.variant ?? item.variants[0].variant;
  return unitPriceOf(k, item.itemId, variant, draftSelections(item, variant, draft.selections)) * draft.qty;
}
