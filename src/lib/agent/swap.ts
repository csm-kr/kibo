import { findItem, groupsFor } from "@/lib/adapters/catalog";
import type { KioskData, Variant } from "@/types/menu";
import type { CartLine } from "@/types/session";
import type { toolResult } from "./mapping";

// A swap ("cancel that, make it a bulgogi set") is a remove and an add. A judge's large fries and cider were lost on
// one: the add was refused for the drink, and after the tap the set came with medium fries (16-judge-r3-fixes:1). So
// within one request (text) or one tool batch (voice), the first add after exactly one line went out takes that line's
// choices for every group the model left out, where the new item has the group and the option. Menu data decides;
// the server still validates the add as usual.

type Outcome = Parameters<typeof toolResult>[2];
type ToolOptions = { groupId: string; optionIds: string[] }[];

/** `args` with the replaced line's single/set and options filled in where the model said nothing. */
export function carryOver(k: KioskData, replaced: CartLine, args: unknown): unknown {
  if (typeof args !== "object" || args === null) return args;
  const a = args as { itemId?: unknown; variant?: unknown; options?: unknown };
  const item = typeof a.itemId === "string" ? findItem(k, a.itemId) : undefined;
  if (!item) return args;
  const variant = (a.variant ?? (item.variants.some((v) => v.variant === replaced.variant) ? replaced.variant : undefined)) as Variant | undefined;
  if (variant === undefined || !item.variants.some((v) => v.variant === variant)) return args;

  const given: ToolOptions = Array.isArray(a.options) ? (a.options as ToolOptions) : [];
  // A group the model named, even with an empty list (the user dropped that choice), is left as it said.
  const said = new Set(given.map((o) => o?.groupId));
  const carried: ToolOptions = [];
  for (const group of groupsFor(item, variant)) {
    if (said.has(group.groupId)) continue;
    const ids = (replaced.selections[group.groupId] ?? []).filter((id) => group.options.some((o) => o.optionId === id && !o.soldOut));
    if (ids.length > 0 && ids.length === (replaced.selections[group.groupId] ?? []).length && ids.length <= group.max) {
      carried.push({ groupId: group.groupId, optionIds: ids });
    }
  }
  if (carried.length === 0 && a.variant !== undefined) return args;
  return { ...a, variant, ...(given.length + carried.length > 0 ? { options: [...given, ...carried] } : {}) };
}

/** Tracks one request's or batch's calls in order: `args` before each call, `after` with its outcome. */
export function swapTracker(k: KioskData) {
  // undefined: no line went out; "many": more than one did, so which one is replaced is unclear.
  let replaced: CartLine | "many" | undefined;
  return {
    args(name: string, args: unknown): unknown {
      return name === "addToCart" && replaced && replaced !== "many" ? carryOver(k, replaced, args) : args;
    },
    after(name: string, outcome: Outcome, cartBefore: CartLine[]): void {
      if (!outcome.ok || outcome.response.pending) return;
      if (name === "addToCart") {
        replaced = undefined;
        return;
      }
      if (name !== "removeFromCart" && name !== "undoLastChange") return;
      const gone = cartBefore.filter((l) => !outcome.response.cart.some((x) => x.lineId === l.lineId));
      if (gone.length === 0) return;
      replaced = gone.length === 1 && replaced === undefined ? gone[0] : "many";
    },
  };
}
