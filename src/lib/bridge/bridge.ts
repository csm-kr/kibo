import { isForbiddenLabel } from "@/lib/adapters/learned";
import type { KioskData, LearnedKiosk, MenuItem, RecipeStep } from "@/types/menu";
import type { BridgeChange, CartLine, DineOption, PendingBridgeCommand, Session } from "@/types/session";
import { clickables, findByLabel } from "./labels";
import { planSteps, runPlan, type TapEvent, type Vars } from "./recipe";
import type { ReplayResult, ReplayTap } from "./replayView";
import { type KioskLine, parseKioskLine, readKioskLines, readKioskTotal, sameLines } from "./verify";

// The in-page bridge for a learned kiosk (docs/ARCHITECTURE.md sequence 3): replays the one pending change on the
// kiosk page, checks the kiosk's own total and lines, and reports with the kiosk token. On any failure it closes
// open dialogs and reports ok: false; the server then calls staff. Nothing is retried (double-add risk).

export class BridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BridgeError";
  }
}

const MAX_QTY = 10;
const MAX_LINES = 20;
const MAX_LINE_CHARS = 120;
/** Close or cancel controls among the skill's UI labels, clicked after a failed step to leave the kiosk usable. */
const CLOSE_WORDS = /닫기|취소|아니요|close|cancel/i;

function requireLearned(kiosk: KioskData): LearnedKiosk {
  if (kiosk.kind !== "learned" || !kiosk.learned) throw new BridgeError("Not a learned kiosk");
  return kiosk.learned;
}

function labelFor(map: Record<string, string>, id: string): string {
  if (!Object.hasOwn(map, id)) throw new BridgeError("Not in the catalog");
  return map[id];
}

function requireItem(kiosk: KioskData, itemId: string): MenuItem {
  const item = kiosk.items.find((i) => i.itemId === itemId);
  if (!item) throw new BridgeError("Not in the catalog");
  return item;
}

type Chosen = { optionId: string; priceDelta: number };

/** Selected option ids per group, in the item's group order, checked against the item; required groups take their defaults. */
function chosenByGroup(item: MenuItem, selections: Record<string, string[]>): { groupId: string; options: Chosen[] }[] {
  for (const groupId of Object.keys(selections)) {
    if (!item.optionGroups.some((g) => g.groupId === groupId)) throw new BridgeError("Not in the catalog");
  }
  return item.optionGroups.map((g) => {
    const given = Object.hasOwn(selections, g.groupId) ? selections[g.groupId] : [];
    const ids = given.length === 0 && g.required ? g.defaultOptionIds : given;
    return {
      groupId: g.groupId,
      options: ids.map((optionId) => {
        const option = g.options.find((o) => o.optionId === optionId);
        if (!option) throw new BridgeError("Not in the catalog");
        return { optionId, priceDelta: option.priceDelta };
      }),
    };
  });
}

function chosenOptions(item: MenuItem, selections: Record<string, string[]>): Chosen[] {
  return chosenByGroup(item, selections).flatMap((g) => g.options);
}

function usesChooseOptions(steps: RecipeStep[]): boolean {
  return steps.some((s) => s.op === "chooseOptions" || usesChooseOptions(s.steps ?? []));
}

function dineLabel(learned: LearnedKiosk, option: DineOption): string {
  return learned.dineLabels[option];
}

/** The recipe and its variables for a change, built from the catalog by id; throws before any click. */
export function changeVars(kiosk: KioskData, change: BridgeChange): { recipe: string; vars: Vars } {
  const learned = requireLearned(kiosk);
  switch (change.type) {
    case "setDineOption":
      return { recipe: "startOrder", vars: { dineOption: dineLabel(learned, change.args.option) } };
    case "addToCart": {
      const { itemId, qty = 1, selections = {} } = change.args;
      const item = requireItem(kiosk, itemId);
      if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new BridgeError("Bad quantity");
      return {
        recipe: "addToCart",
        vars: {
          category: labelFor(learned.labels.categories, item.category),
          item: labelFor(learned.labels.items, itemId),
          options: chosenOptions(item, selections).map((o) => labelFor(learned.labels.options, o.optionId)),
          qtyMinus1: qty - 1,
          // Only a recipe with chooseOptions needs the options split by group, with each group's own steps.
          ...(usesChooseOptions(learned.recipes.addToCart ?? []) && {
            groups: chosenByGroup(item, selections).map((g) => ({
              options: g.options.map((o) => labelFor(learned.labels.options, o.optionId)),
              ...learned.groupSteps[g.groupId],
            })),
          }),
        },
      };
    }
    case "removeFromCart":
      if (!Number.isInteger(change.lineIndex) || change.lineIndex < 0 || change.lineIndex >= MAX_LINES) {
        throw new BridgeError("Bad line index");
      }
      return { recipe: "removeLine", vars: { lineIndex: change.lineIndex } };
  }
}

function kioskLine(kiosk: KioskData, line: Pick<CartLine, "itemId" | "selections" | "qty" | "unitPrice">): KioskLine {
  const learned = requireLearned(kiosk);
  const item = requireItem(kiosk, line.itemId);
  return {
    name: labelFor(learned.labels.items, line.itemId),
    options: chosenOptions(item, line.selections).map((o) => labelFor(learned.labels.options, o.optionId)),
    qty: line.qty,
    price: line.unitPrice * line.qty,
  };
}

/** What the kiosk's cart should show after the change: the session cart (before it) with the change applied. */
export function expectedLines(kiosk: KioskData, cart: CartLine[], change: BridgeChange): KioskLine[] {
  const lines = cart.map((l) => kioskLine(kiosk, l));
  switch (change.type) {
    case "setDineOption":
      return lines;
    case "removeFromCart":
      return lines.filter((_, i) => i !== change.lineIndex);
    case "addToCart": {
      const { itemId, qty = 1, selections = {} } = change.args;
      const item = requireItem(kiosk, itemId);
      const unitPrice = item.variants[0].price + chosenOptions(item, selections).reduce((sum, o) => sum + o.priceDelta, 0);
      return [...lines, kioskLine(kiosk, { itemId, selections, qty, unitPrice })];
    }
  }
}

export interface BridgeReportArgs {
  commandId: string;
  ok: boolean;
  kioskTotal: number | null;
  kioskLines: string[];
}

export interface BridgeOutcome extends ReplayResult {
  /** Replay and verification time, before the report is sent; the host's pauses in onTap are not counted. */
  ms: number;
}

export interface BridgeConfig {
  doc: Document;
  kiosk: KioskData;
  sessionId: string;
  kioskToken: string;
  send(input: { sessionId: string; token: string; type: "bridgeReport"; args: BridgeReportArgs; source: "touch" }): Promise<unknown>;
  /** Each click right before it happens, numbered per command, so the host can draw it (14-final:3); awaited. */
  onTap?(commandId: string, tap: ReplayTap): void | Promise<void>;
}

export function createBridge(cfg: BridgeConfig) {
  const { doc, kiosk } = cfg;
  const learned = requireLearned(kiosk);
  const forbidden = learned.forbiddenLabels;
  const handled = new Set<string>();
  let queue: Promise<unknown> = Promise.resolve();

  const recipe = (name: string) => {
    const steps = learned.recipes[name];
    if (!steps) throw new BridgeError(`The skill has no ${name} recipe`);
    return steps;
  };

  /** The kiosk's home screen shows the first label of its startOrder recipe. */
  function onHome(): boolean {
    const first = recipe("startOrder")[0]?.label;
    return first !== undefined && findByLabel(doc, first).length > 0;
  }

  function closeDialogs() {
    for (const c of clickables(doc)) {
      if (learned.uiLabels.includes(c.label) && CLOSE_WORDS.test(c.label) && !isForbiddenLabel(c.label, forbidden)) {
        c.el.click();
      }
    }
  }

  async function replay(p: PendingBridgeCommand, session: Session, onTap: (tap: TapEvent) => Promise<void>): Promise<boolean> {
    // Everything is checked and planned before the first click.
    const { recipe: name, vars } = changeVars(kiosk, p);
    const expected = expectedLines(kiosk, session.cart, p);
    const plan = planSteps(recipe(name), vars, forbidden);
    const home = onHome();
    const opts = { forbiddenLabels: forbidden, onTap };

    if (p.type === "setDineOption") {
      if (home) await runPlan(doc, plan, opts);
      // The kiosk has no way back to its dine question once an order has started.
      else if (session.dineOption !== p.args.option) throw new BridgeError("The kiosk order has already started");
    } else {
      if (home) {
        const start = { dineOption: dineLabel(learned, session.dineOption ?? "eat_in") };
        await runPlan(doc, planSteps(recipe("startOrder"), start, forbidden), opts);
      }
      await runPlan(doc, plan, opts);
    }

    const seen = readKioskLines(doc, learned.cartLinePattern).map((l) => parseKioskLine(l, learned.cartLinePattern));
    return seen.every((l) => l !== null) && sameLines(expected, seen as KioskLine[]);
  }

  async function run(p: PendingBridgeCommand, session: Session): Promise<BridgeOutcome> {
    const started = performance.now();
    const taps: ReplayTap[] = [];
    // Time spent in the host's onTap (a pause so a person can see the tap) is not replay time.
    let paused = 0;
    const onTap = async (t: TapEvent) => {
      const tap = { n: taps.length + 1, ...t };
      taps.push(tap);
      const before = performance.now();
      await cfg.onTap?.(p.commandId, tap);
      paused += performance.now() - before;
    };
    let ok = false;
    try {
      ok = await replay(p, session, onTap);
    } catch {
      ok = false;
    }
    if (!ok) closeDialogs();
    const args: BridgeReportArgs = {
      commandId: p.commandId,
      ok,
      kioskTotal: readKioskTotal(doc, learned.cartTotalPattern),
      kioskLines: readKioskLines(doc, learned.cartLinePattern)
        .slice(0, MAX_LINES)
        .map((l) => l.slice(0, MAX_LINE_CHARS)),
    };
    const ms = Math.round(performance.now() - started - paused);
    let reported = true;
    try {
      await cfg.send({ sessionId: cfg.sessionId, token: cfg.kioskToken, type: "bridgeReport", args, source: "touch" });
    } catch {
      // No report: the server counts the replay as failed after its timeout, which calls staff.
      reported = false;
    }
    return { commandId: p.commandId, change: p, cartBefore: session.cart, taps, ok, reported, kioskTotal: args.kioskTotal, ms };
  }

  return {
    /** Replays one pending command, one at a time; a command already handled is ignored (null). */
    handle(pending: PendingBridgeCommand, session: Session): Promise<BridgeOutcome | null> {
      if (handled.has(pending.commandId)) return Promise.resolve(null);
      handled.add(pending.commandId);
      const next = queue.then(() => run(pending, session));
      queue = next.catch(() => {});
      return next;
    },
  };
}
