import { findItem, findOption, groupsFor, isAvailableNow } from "@/lib/adapters/catalog";
import type { KioskData, MenuItem, Variant } from "@/types/menu";
import type { CartLine, LineChanges, LineInput } from "@/types/session";
import { type ChoiceRef, CommandError } from "./errors";

// Pure cart logic: no I/O, no clock. `now` and `newLineId` come from the caller.
// Prices and names come only from KioskData, never from input (tool arguments come from the browser).

export const MAX_LINES = 20;
export const MAX_QTY = 10;

export type ResolvedLine = Omit<CartLine, "lineId">;

function lower(name: string): string {
  return name.toLowerCase();
}

function requireItem(k: KioskData, itemId: string): MenuItem {
  const item = findItem(k, itemId);
  if (!item) throw new CommandError("BAD_REQUEST", "That item is not on the menu.");
  return item;
}

function alternatives(k: KioskData, item: MenuItem, now: number): ChoiceRef[] {
  return k.items
    .filter((i) => i.category === item.category && i.itemId !== item.itemId && !i.soldOut && isAvailableNow(i, now))
    .slice(0, 2)
    .map((i) => ({ kind: "item", id: i.itemId }));
}

function checkQty(qty: number): void {
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
    throw new CommandError("BAD_REQUEST", `Please choose a quantity from 1 to ${MAX_QTY}.`);
  }
}

/** Validates the line against the menu, fills defaults and computes the price. */
export function resolveLine(k: KioskData, input: LineInput, now: number): ResolvedLine {
  const item = requireItem(k, input.itemId);
  const itemName = item.name.en;

  if (item.soldOut) {
    throw new CommandError("SOLD_OUT", `Sorry, the ${lower(itemName)} is sold out.`, {
      templateId: "alternatives",
      choices: alternatives(k, item, now),
    });
  }
  if (!isAvailableNow(item, now)) {
    throw new CommandError("UNAVAILABLE", `Sorry, the ${lower(itemName)} is not available right now.`, {
      templateId: "alternatives",
      choices: alternatives(k, item, now),
    });
  }

  let variant = input.variant;
  if (variant === undefined) {
    if (item.variants.length !== 1) {
      throw new CommandError("NEEDS_CHOICE", `Single or set? Please choose for the ${lower(itemName)}.`, {
        templateId: "pick_variant",
        itemId: item.itemId,
        choices: item.variants.map((v) => ({ kind: "variant", id: v.variant })),
      });
    }
    variant = item.variants[0].variant;
  } else if (!item.variants.some((v) => v.variant === variant)) {
    throw new CommandError("BAD_REQUEST", `That choice is not available for the ${lower(itemName)}.`);
  }

  const qty = input.qty ?? 1;
  checkQty(qty);

  const groups = groupsFor(item, variant);
  const given = input.selections ?? {};
  for (const groupId of Object.keys(given)) {
    if (!groups.some((g) => g.groupId === groupId)) {
      throw new CommandError("BAD_REQUEST", `That option is not available for the ${lower(itemName)}.`);
    }
  }

  const selections: Record<string, string[]> = {};
  for (const group of groups) {
    const groupName = lower(group.name.en);
    let chosen = Object.hasOwn(given, group.groupId) ? given[group.groupId] : [];
    if (chosen.length === 0 && group.required) {
      if (group.defaultOptionIds.length === 0) {
        throw new CommandError("NEEDS_CHOICE", `Please choose a ${groupName}.`, {
          templateId: "pick_option",
          itemId: item.itemId,
          groupId: group.groupId,
          choices: group.options.filter((o) => !o.soldOut).map((o) => ({ kind: "option", id: o.optionId })),
        });
      }
      chosen = group.defaultOptionIds;
    }
    if (new Set(chosen).size !== chosen.length) {
      throw new CommandError("BAD_REQUEST", `Please choose each ${groupName} option only once.`);
    }
    for (const optionId of chosen) {
      const option = findOption(group, optionId);
      if (!option) {
        throw new CommandError("BAD_REQUEST", `That ${groupName} option is not available for the ${lower(itemName)}.`);
      }
      if (option.soldOut) {
        throw new CommandError("SOLD_OUT", `Sorry, ${option.name.en} is sold out. Please choose another ${groupName}.`, {
          templateId: "pick_option",
          itemId: item.itemId,
          groupId: group.groupId,
          choices: group.options
            .filter((o) => !o.soldOut && o.optionId !== optionId)
            .map((o) => ({ kind: "option", id: o.optionId })),
        });
      }
    }
    if (chosen.length < group.min || chosen.length > group.max) {
      const range = group.min === group.max ? `${group.max}` : `${group.min} to ${group.max}`;
      throw new CommandError("BAD_REQUEST", `Please choose ${range} for ${groupName}.`);
    }
    if (chosen.length > 0) selections[group.groupId] = [...chosen];
  }

  return { itemId: item.itemId, variant, qty, selections, unitPrice: unitPriceOf(k, item.itemId, variant, selections) };
}

/** Variant price plus the selected options' price deltas. Expects already validated selections. */
export function unitPriceOf(
  k: KioskData,
  itemId: string,
  variant: Variant,
  selections: Record<string, string[]>,
): number {
  const item = requireItem(k, itemId);
  const base = item.variants.find((v) => v.variant === variant);
  if (!base) throw new CommandError("BAD_REQUEST", "That choice is not available for this item.");
  let price = base.price;
  for (const group of groupsFor(item, variant)) {
    for (const optionId of selections[group.groupId] ?? []) {
      price += findOption(group, optionId)?.priceDelta ?? 0;
    }
  }
  return price;
}

export function cartTotal(cart: CartLine[]): number {
  return cart.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
}

function sortedSelections(s: Record<string, string[]>): string {
  return JSON.stringify(
    Object.keys(s)
      .filter((g) => s[g].length > 0)
      .sort()
      .map((g) => [g, [...s[g]].sort()]),
  );
}

/** Same item, variant and selections (order-insensitive); qty and price are ignored. */
export function sameLine(
  a: Pick<CartLine, "itemId" | "variant" | "selections">,
  b: Pick<CartLine, "itemId" | "variant" | "selections">,
): boolean {
  return a.itemId === b.itemId && a.variant === b.variant && sortedSelections(a.selections) === sortedSelections(b.selections);
}

export function addLine(
  k: KioskData,
  cart: CartLine[],
  input: LineInput,
  now: number,
  newLineId: () => string,
): { cart: CartLine[]; lineId: string } {
  const resolved = resolveLine(k, input, now);
  const existing = cart.find((line) => sameLine(line, resolved));
  if (existing) {
    const qty = existing.qty + resolved.qty;
    if (qty > MAX_QTY) {
      throw new CommandError("BAD_REQUEST", `You can order up to ${MAX_QTY} of the same item.`);
    }
    return {
      cart: cart.map((line) => (line === existing ? { ...line, qty } : line)),
      lineId: existing.lineId,
    };
  }
  if (cart.length >= MAX_LINES) {
    throw new CommandError("BAD_REQUEST", `The cart can hold up to ${MAX_LINES} different items.`);
  }
  const lineId = newLineId();
  return { cart: [...cart, { lineId, ...resolved }], lineId };
}

function lineIndex(cart: CartLine[], lineId: string): number {
  const index = cart.findIndex((line) => line.lineId === lineId);
  if (index < 0) throw new CommandError("BAD_REQUEST", "That item is no longer in the cart.");
  return index;
}

/** `changes.selections` replaces only the groups it names; the whole line is then re-validated and re-priced. */
export function updateLine(
  k: KioskData,
  cart: CartLine[],
  lineId: string,
  changes: LineChanges,
  now: number,
): CartLine[] {
  const index = lineIndex(cart, lineId);
  const line = cart[index];
  const item = requireItem(k, line.itemId);
  const variant = changes.variant ?? line.variant;
  // Kept groups that no longer apply to the variant are dropped (set → single drops side and drink).
  const applies = new Set(groupsFor(item, variant).map((g) => g.groupId));
  const kept = Object.fromEntries(Object.entries(line.selections).filter(([groupId]) => applies.has(groupId)));
  const resolved = resolveLine(k, {
    itemId: line.itemId,
    variant,
    qty: changes.qty ?? line.qty,
    selections: { ...kept, ...changes.selections },
  }, now);
  return cart.map((l, i) => (i === index ? { lineId, ...resolved } : l));
}

export function removeLine(cart: CartLine[], lineId: string): CartLine[] {
  const index = lineIndex(cart, lineId);
  return cart.filter((_, i) => i !== index);
}
