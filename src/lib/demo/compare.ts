import { z } from "zod";
import type { Variant } from "@/types/menu";

// /demo D3 "touch vs talk" card (docs/PRD.md "Demo scenario" step 8). Every number is either counted live for this
// demo order or read from an evidence file at build time (src/lib/demo/evidence.ts); nothing is estimated (R-001).

export interface OrderLine {
  itemId: string;
  variant: Variant;
  qty: number;
  selections: Record<string, string[]>;
}

/** The kiosk the hero order and its touch evidence belong to; the card shows only there. */
export const HERO_KIOSK = "malo";

/** The hero order (docs/PRD.md): two cheeseburger sets with large fries, one zero cola without pickles, one cider. */
export const HERO_CART: OrderLine[] = [
  { itemId: "cheese_burger", variant: "set", qty: 1, selections: { side: ["fries_l"], drink: ["zero_cola"], ingredients: ["no_pickles"] } },
  { itemId: "cheese_burger", variant: "set", qty: 1, selections: { side: ["fries_l"], drink: ["cider"] } },
];

/** One key per unit, so line order, option order, empty groups and qty splits do not matter. */
function unitKeys(cart: OrderLine[]): string[] {
  return cart
    .flatMap((l) => {
      const groups = Object.keys(l.selections)
        .filter((g) => l.selections[g].length > 0)
        .sort()
        .map((g) => `${g}=${[...l.selections[g]].sort().join(",")}`)
        .join(";");
      return Array.from({ length: l.qty }, () => `${l.itemId}|${l.variant}|${groups}`);
    })
    .sort();
}

export function sameOrder(cart: OrderLine[], reference: OrderLine[] = HERO_CART): boolean {
  const a = unitKeys(cart);
  const b = unitKeys(reference);
  return a.length > 0 && a.length === b.length && a.every((k, i) => k === b[i]);
}

export function median(values: number[]): number {
  const s = [...values].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const lineSchema = z.object({
  itemId: z.string(),
  variant: z.enum(["single", "set", "largeSet"]),
  qty: z.number().int().positive(),
  selections: z.record(z.string(), z.array(z.string())),
});

/** `evidence/touch-hero-efficient.json` (e2e/kiosk-touch-efficient.spec.ts). */
const touchRunSchema = z.object({
  date: z.string(),
  taps: z.number().int().positive(),
  seconds: z.number().nonnegative(),
  total: z.number().int().nonnegative(),
  cart: z.array(lineSchema),
  note: z.string(),
});
export type TouchRun = z.infer<typeof touchRunSchema>;

/** `evidence/human-runs.json` (scripts/measure-touch.md); only runs with real numbers count. */
const humanRunsSchema = z.object({
  touch: z.array(z.object({ date: z.string(), person: z.string(), taps: z.number().int().positive(), seconds: z.number().positive() })).min(1),
  voice: z.array(
    z.object({
      date: z.string(),
      person: z.string(),
      utterances: z.number().int().nonnegative(),
      phoneTaps: z.number().int().nonnegative(),
      kioskTaps: z.number().int().nonnegative(),
      seconds: z.number().positive(),
    }),
  ),
});
export type HumanRuns = z.infer<typeof humanRunsSchema>;

export function parseTouchRun(raw: unknown): TouchRun | null {
  const r = touchRunSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export function parseHumanRuns(raw: unknown): HumanRuns | null {
  const r = humanRunsSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Counted in the browser for this demo order, from [Start] (or [Try again]) to the order number. */
export interface LiveCounts {
  /** Turns sent to the AI: typed, spoken, an example, or a choice button. */
  sentences: number;
  phoneTaps: number;
  kioskTaps: number;
  seconds: number;
}

export type TouchColumn =
  // An automated run taps at machine speed, so only its taps are shown, never its seconds.
  | { source: "automated"; taps: number; date: string; sameOrder: boolean; editPathTaps: number | null }
  | { source: "human"; runs: number; taps: number; seconds: number; sameOrder: boolean };

export interface Comparison {
  live: LiveCounts;
  /** Null when no evidence file exists: the card hides the touch column. */
  touch: TouchColumn | null;
}

export function buildComparison(input: {
  live: LiveCounts;
  cart: OrderLine[];
  automated: TouchRun | null;
  human: HumanRuns | null;
  /** Taps of the older edit path (evidence/touch-hero.json): clear the cart and add again to change an option. */
  editPathTaps?: number | null;
}): Comparison {
  const same = sameOrder(input.cart);
  const { human, automated } = input;
  let touch: TouchColumn | null = null;
  if (human) {
    touch = {
      source: "human",
      runs: human.touch.length,
      taps: median(human.touch.map((r) => r.taps)),
      seconds: median(human.touch.map((r) => r.seconds)),
      sameOrder: same,
    };
  } else if (automated) {
    touch = { source: "automated", taps: automated.taps, date: automated.date, sameOrder: same, editPathTaps: input.editPathTaps ?? null };
  }
  return { live: input.live, touch };
}
