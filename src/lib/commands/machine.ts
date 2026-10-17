import { findItem, isAvailableNow } from "@/lib/adapters/catalog";
import type { KioskData } from "@/types/menu";
import type {
  Actor,
  BridgeChange,
  CartLine,
  ChangeKind,
  DineOption,
  PendingBridgeCommand,
  Session,
  SessionStatus,
  Source,
} from "@/types/session";
import { ACTOR_COMMANDS, ACTOR_SOURCES } from "./actors";
import { addLine, cartTotal, removeLine, updateLine } from "./cart";
import { type ChoiceRef, CommandError } from "./errors";
import type { Command, CommandType } from "./schemas";
import { SESSION_TTL_MS } from "./session";
import { learnedUndoLine } from "./undo";

// Pure session state machine: no clock, env or storage; everything comes through ctx.
// Safety promise: only confirmCheckout in `confirming` reaches `paying`, and only the kiosk's cardAction reaches `paid`.

export const UNDO_DEPTH = 5;
export const RECENT_COMMANDS = 30;
/** An AI confirm needs a new utterance at least this long after the confirm card appeared. */
export const CONFIRM_WAIT_MS = 1500;

export interface CommandContext {
  actor: Actor;
  now: number;
  kiosk: KioskData;
  newLineId: () => string;
  newOrderNumber: () => number;
  /** Strict sites (CONFIRM_TAP_ONLY): only a tap on the confirm card, never the AI, confirms. Default off. */
  confirmTapOnly?: boolean;
}

export interface CommandResult {
  upsell?: { offerItemIds: string[] };
  lineId?: string;
  /** Learned kiosks: accepted and waiting for the bridge to replay it. */
  pending?: true;
}

export const BEFORE_PAYING: SessionStatus[] = ["idle", "connected", "ordering", "confirming"];
const CART_EDITABLE: SessionStatus[] = ["connected", "ordering", "confirming"];

function requireStatus(s: Session, allowed: SessionStatus[], message: string): void {
  if (!allowed.includes(s.status)) throw new CommandError("CONFLICT", message);
}

function withCart(
  s: Session,
  source: Source,
  ctx: CommandContext,
  change: { cart: CartLine[]; undoStack: CartLine[][]; lineId: string | null; kind: ChangeKind; itemId: string | null },
): Session {
  const item = change.itemId ? findItem(ctx.kiosk, change.itemId) : undefined;
  return {
    ...s,
    status: "ordering",
    cart: change.cart,
    total: cartTotal(change.cart),
    cartVersion: s.cartVersion + 1,
    undoStack: change.undoStack,
    lastChange: { lineId: change.lineId, kind: change.kind, source, at: ctx.now },
    screen: item ? { category: item.category, itemId: item.itemId } : s.screen,
  };
}

function requireDineOptions(k: KioskData): void {
  if (!k.dineOptions) throw new CommandError("BAD_REQUEST", "This kiosk does not ask eat-in or take-out.");
}

function withDineOption(s: Session, option: DineOption): Session {
  const status = s.status === "confirming" ? "confirming" : "ordering";
  // The confirm card shows the dine option, so a change during the review must make an open card stale.
  const changed = s.status === "confirming" && s.dineOption !== option;
  const cartVersion = changed ? s.cartVersion + 1 : s.cartVersion;
  return { ...s, status, dineOption: option, cartVersion };
}

function pushUndo(s: Session): CartLine[][] {
  return [...s.undoStack, s.cart].slice(-UNDO_DEPTH);
}

function lineItemId(s: Session, lineId: string): string | null {
  return s.cart.find((l) => l.lineId === lineId)?.itemId ?? null;
}

/** First matching rule whose offers do not include the added item; offers filtered to what can be ordered now. */
function upsellOffer(k: KioskData, itemId: string, now: number): string[] | null {
  const item = findItem(k, itemId);
  if (!item) return null;
  const rule = k.upsellRules.find(
    (r) => (r.whenItemId === item.itemId || r.whenCategory === item.category) && !r.offerItemIds.includes(item.itemId),
  );
  if (!rule) return null;
  return rule.offerItemIds.filter((id) => {
    const offer = findItem(k, id);
    return offer !== undefined && !offer.soldOut && isAvailableNow(offer, now);
  });
}

function isValidChoice(k: KioskData, c: ChoiceRef): boolean {
  switch (c.kind) {
    case "item":
      return findItem(k, c.id) !== undefined;
    case "variant":
      return c.id === "single" || c.id === "set" || c.id === "largeSet";
    case "option":
      return k.items.some((i) => i.optionGroups.some((g) => g.options.some((o) => o.optionId === c.id)));
    case "dine":
      return k.dineOptions !== undefined && (c.id === "eat_in" || c.id === "take_out");
    case "yesno":
      return c.id === "yes" || c.id === "no";
    case "staff":
      return c.id === "staff";
  }
}

function isConfirmed(s: Session, cmd: Command, ctx: CommandContext): boolean {
  if (ctx.actor === "kiosk") return cmd.source === "touch";
  if (cmd.source === "button") return true;
  if (ctx.confirmTapOnly) return false;
  // A null seq means the kiosk opened the review or an edit reopened it: the phone's AI never saw a "yes" after it, so only a tap counts.
  return (
    cmd.utteranceSeq !== undefined &&
    s.checkoutUtteranceSeq !== null &&
    cmd.utteranceSeq > s.checkoutUtteranceSeq &&
    s.checkoutAt !== null &&
    ctx.now - s.checkoutAt >= CONFIRM_WAIT_MS
  );
}

function transition(s: Session, cmd: Command, ctx: CommandContext): { next: Session; result: CommandResult } {
  const k = ctx.kiosk;
  switch (cmd.type) {
    case "startTouch":
      requireStatus(s, ["idle", "connected", "ordering"], "An order is already in progress.");
      return { next: s.status === "idle" ? { ...s, status: "ordering" } : s, result: {} };

    case "setDineOption": {
      requireDineOptions(k);
      const allowed: SessionStatus[] = ctx.actor === "kiosk" ? ["idle", ...CART_EDITABLE] : CART_EDITABLE;
      requireStatus(s, allowed, "The order can no longer be changed.");
      return { next: withDineOption(s, cmd.args.option), result: {} };
    }

    case "addToCart": {
      requireStatus(s, CART_EDITABLE, "Please start an order first.");
      const { cart, lineId } = addLine(k, s.cart, cmd.args, ctx.now, ctx.newLineId);
      let next = withCart(s, cmd.source, ctx, { cart, undoStack: pushUndo(s), lineId, kind: "add", itemId: cmd.args.itemId });
      const result: CommandResult = { lineId };
      if (!s.upsellOffered) {
        const offer = upsellOffer(k, cmd.args.itemId, ctx.now);
        if (offer) {
          next = { ...next, upsellOffered: true };
          if (offer.length > 0) result.upsell = { offerItemIds: offer };
        }
      }
      return { next, result };
    }

    case "updateCart": {
      requireStatus(s, CART_EDITABLE, "The order can no longer be changed.");
      const { lineId, changes } = cmd.args;
      const cart = updateLine(k, s.cart, lineId, changes, ctx.now);
      const itemId = lineItemId(s, lineId);
      return { next: withCart(s, cmd.source, ctx, { cart, undoStack: pushUndo(s), lineId, kind: "update", itemId }), result: {} };
    }

    case "removeFromCart": {
      requireStatus(s, CART_EDITABLE, "The order can no longer be changed.");
      const { lineId } = cmd.args;
      const cart = removeLine(s.cart, lineId);
      const itemId = lineItemId(s, lineId);
      return { next: withCart(s, cmd.source, ctx, { cart, undoStack: pushUndo(s), lineId, kind: "remove", itemId }), result: {} };
    }

    case "clearCart":
      requireStatus(s, ["ordering", "confirming"], "The order can no longer be changed.");
      return { next: withCart(s, cmd.source, ctx, { cart: [], undoStack: pushUndo(s), lineId: null, kind: "clear", itemId: null }), result: {} };

    case "undoLastChange": {
      requireStatus(s, BEFORE_PAYING, "The order can no longer be changed.");
      if (s.undoStack.length === 0) throw new CommandError("CONFLICT", "Nothing to undo.");
      const cart = s.undoStack[s.undoStack.length - 1];
      const undoStack = s.undoStack.slice(0, -1);
      return { next: withCart(s, cmd.source, ctx, { cart, undoStack, lineId: null, kind: "undo", itemId: null }), result: {} };
    }

    case "offerChoices": {
      requireStatus(s, BEFORE_PAYING, "The order can no longer be changed.");
      const { templateId, choices } = cmd.args;
      if (!choices.every((c) => isValidChoice(k, c))) {
        throw new CommandError("BAD_REQUEST", "That choice is not on the menu.");
      }
      return { next: { ...s, pendingChoice: { templateId, choices: choices.map((c) => ({ ...c })) } }, result: {} };
    }

    case "callStaff":
      return { next: { ...s, staffCalled: { reasonCode: cmd.args.reasonCode, at: ctx.now } }, result: {} };

    case "requestCheckout":
      requireStatus(s, ["ordering"], "Please add something to your order first.");
      if (s.cart.length === 0) throw new CommandError("CONFLICT", "Your cart is empty.");
      if (k.dineOptions && s.dineOption === null) throw needsDine();
      return {
        next: {
          ...s,
          status: "confirming",
          checkoutUtteranceSeq: ctx.actor === "phone" ? (cmd.utteranceSeq ?? null) : null,
          checkoutAt: ctx.now,
        },
        result: {},
      };

    case "cancelCheckout":
      requireStatus(s, ["confirming"], "There is no order to go back from.");
      return { next: { ...s, status: "ordering" }, result: {} };

    case "confirmCheckout":
      requireStatus(s, ["confirming"], "Please review your order first.");
      if (cmd.cartVersion !== s.cartVersion) {
        throw new CommandError("CONFLICT", "Your order changed. Please check it again.");
      }
      if (!isConfirmed(s, cmd, ctx)) throw new CommandError("CONFLICT", "Please confirm on the card.");
      return { next: { ...s, status: "paying" }, result: {} };

    case "editOrder":
      requireStatus(s, ["paying"], "There is no payment to go back from.");
      // The review card appears again and no utterance after it is known, so the phone must tap the card.
      return { next: { ...s, status: "confirming", checkoutUtteranceSeq: null, checkoutAt: ctx.now }, result: {} };

    case "cardAction":
      requireStatus(s, ["paying"], "Please confirm the order before paying.");
      return { next: { ...s, status: "paid", orderNumber: ctx.newOrderNumber(), paidAt: ctx.now }, result: {} };

    case "reissueClaim":
      // The session service rotates the claim and device secrets; the machine only checks the state.
      requireStatus(s, BEFORE_PAYING, "A new phone cannot connect during payment.");
      return { next: s, result: {} };

    case "bridgeReport":
      throw new CommandError("CONFLICT", NO_BRIDGE_CHANGE);
  }
}

/** The dine question as buttons (pick_dine), so the AI or the server can offer it with offerChoices. */
function needsDine(): CommandError {
  return new CommandError("NEEDS_CHOICE", "Eat here or take out?", {
    templateId: "pick_dine",
    choices: [
      { kind: "dine", id: "eat_in" },
      { kind: "dine", id: "take_out" },
    ],
  });
}

// Learned kiosks (KIBO Learn): the kiosk page is the source of truth. A cart change is validated here, then waits in
// pendingBridgeCommand until the bridge replays it and reports the kiosk's total. Nothing is retried automatically
// (double-add risk), and the order ends at `confirming`: the user pays on the kiosk itself.

/** A pending replay older than this counts as failed (the phone gives up waiting after 15 s). */
export const BRIDGE_TIMEOUT_MS = 20_000;

const KIOSK_BUSY = "The kiosk is still working on your last request.";
const PAY_ON_KIOSK = "Please finish and pay on the kiosk screen.";
const NO_BRIDGE_CHANGE = "There is no kiosk change waiting for this report.";
/** Commands that would act on a cart the kiosk has not finished changing. */
const WAITS_FOR_BRIDGE: CommandType[] = ["setDineOption", "addToCart", "removeFromCart", "undoLastChange", "requestCheckout"];

function bridgeFailed(s: Session, now: number): Session {
  return {
    ...s,
    pendingBridgeCommand: null,
    staffCalled: { reasonCode: "learned_mismatch", at: now },
    bridgeStatus: { lastOk: false, at: now },
  };
}

function isStale(p: PendingBridgeCommand, now: number): boolean {
  return now - p.at > BRIDGE_TIMEOUT_MS;
}

/** The session after the pending change, built from menu data exactly as on a direct kiosk. */
function applyBridgeChange(s: Session, p: PendingBridgeCommand, ctx: CommandContext): Session {
  switch (p.type) {
    case "setDineOption":
      return withDineOption(s, p.args.option);
    case "addToCart": {
      const { cart, lineId } = addLine(ctx.kiosk, s.cart, p.args, ctx.now, ctx.newLineId);
      return withCart(s, p.source, ctx, { cart, undoStack: pushUndo(s), lineId, kind: "add", itemId: p.args.itemId });
    }
    case "removeFromCart": {
      const { lineId } = p.args;
      const cart = removeLine(s.cart, lineId);
      return withCart(s, p.source, ctx, { cart, undoStack: pushUndo(s), lineId, kind: "remove", itemId: lineItemId(s, lineId) });
    }
  }
}

function learnedTransition(s: Session, cmd: Command, ctx: CommandContext): { next: Session; result: CommandResult } {
  const p = s.pendingBridgeCommand;
  // A replay that never reported is a failure; the next command clears it and goes on.
  const base = p && isStale(p, ctx.now) ? bridgeFailed(s, ctx.now) : s;
  if (base.pendingBridgeCommand && WAITS_FOR_BRIDGE.includes(cmd.type)) throw new CommandError("CONFLICT", KIOSK_BUSY);

  const wait = (change: BridgeChange) => ({
    next: { ...base, pendingBridgeCommand: { ...change, commandId: cmd.commandId, source: cmd.source, at: ctx.now } },
    result: { pending: true as const },
  });

  switch (cmd.type) {
    case "setDineOption": {
      requireDineOptions(ctx.kiosk);
      const allowed: SessionStatus[] = ctx.actor === "kiosk" ? ["idle", ...CART_EDITABLE] : CART_EDITABLE;
      requireStatus(base, allowed, "The order can no longer be changed.");
      return wait({ type: "setDineOption", args: { option: cmd.args.option } });
    }

    case "addToCart":
      requireStatus(base, CART_EDITABLE, "Please start an order first.");
      // The page asks eat-in or take-out once, before its menu, and cannot change it later (I-095); asking first also
      // shows the question as buttons, so the phone can send the held order again after the tap (15-judge-fixes:1).
      if (ctx.kiosk.dineOptions && base.dineOption === null) throw needsDine();
      // Validation only: the line is added when the bridge reports the kiosk's total.
      addLine(ctx.kiosk, base.cart, cmd.args, ctx.now, ctx.newLineId);
      return wait({ type: "addToCart", args: cmd.args });

    case "removeFromCart": {
      requireStatus(base, CART_EDITABLE, "The order can no longer be changed.");
      const lineIndex = base.cart.findIndex((l) => l.lineId === cmd.args.lineId);
      if (lineIndex < 0) throw new CommandError("BAD_REQUEST", "That item is no longer in the cart.");
      return wait({ type: "removeFromCart", args: { lineId: cmd.args.lineId }, lineIndex });
    }

    case "undoLastChange": {
      requireStatus(base, BEFORE_PAYING, "The order can no longer be changed.");
      const line = learnedUndoLine(base);
      if (!line) throw new CommandError("CONFLICT", "On this kiosk, only the last added item can be undone.");
      return wait({ type: "removeFromCart", args: { lineId: line.lineId }, lineIndex: line.lineIndex });
    }

    case "updateCart":
      throw new CommandError("CONFLICT", "On this kiosk, please remove the item and add it again.");

    case "confirmCheckout":
    case "editOrder":
    case "cardAction":
    case "clearCart":
      throw new CommandError("CONFLICT", PAY_ON_KIOSK);

    case "bridgeReport": {
      if (!p || p.commandId !== cmd.args.commandId) throw new CommandError("CONFLICT", NO_BRIDGE_CHANGE);
      if (isStale(p, ctx.now)) return { next: bridgeFailed(s, ctx.now), result: {} };
      let expected: Session | null = null;
      try {
        expected = applyBridgeChange(s, p, ctx);
      } catch (e) {
        if (!(e instanceof CommandError)) throw e;
      }
      // Only the total is compared here; kioskLines are third-party page text and never enter the session.
      if (!cmd.args.ok || expected === null || cmd.args.kioskTotal !== expected.total) {
        return { next: bridgeFailed(s, ctx.now), result: {} };
      }
      return { next: { ...expected, pendingBridgeCommand: null, bridgeStatus: { lastOk: true, at: ctx.now } }, result: {} };
    }

    default:
      return transition(base, cmd, ctx);
  }
}

export function applyCommand(
  s: Session,
  cmd: Command,
  ctx: CommandContext,
): { session: Session; result: CommandResult; duplicate: boolean } {
  if (!ACTOR_COMMANDS[ctx.actor].has(cmd.type)) {
    throw new CommandError("FORBIDDEN", "This action is not allowed here.");
  }
  if (!ACTOR_SOURCES[ctx.actor].includes(cmd.source)) {
    throw new CommandError("BAD_REQUEST", "That request could not be understood.");
  }
  if (s.recentCommandIds.includes(cmd.commandId)) return { session: s, result: {}, duplicate: true };
  if (s.status === "expired" || ctx.now > s.expiresAt) {
    throw new CommandError("GONE", "This order has ended. Please start again at the kiosk.");
  }
  if (s.status === "paid" && cmd.type !== "callStaff") {
    throw new CommandError("CONFLICT", "This order is already paid.");
  }

  const { next, result } = ctx.kiosk.kind === "learned" ? learnedTransition(s, cmd, ctx) : transition(s, cmd, ctx);
  // The bridge's report is not a user answer, so an open question stays open. A dine option answers only the dine
  // question: the AI may have asked "which burger?" before it (10-17, a real iPhone lost those buttons to the dine tap).
  const keepsChoice =
    cmd.type === "offerChoices" ||
    cmd.type === "bridgeReport" ||
    (cmd.type === "setDineOption" && next.pendingChoice?.templateId !== "pick_dine");
  return {
    session: {
      ...next,
      pendingChoice: keepsChoice ? next.pendingChoice : null,
      recentCommandIds: [...s.recentCommandIds, cmd.commandId].slice(-RECENT_COMMANDS),
      lastSeenAt: ctx.now,
      expiresAt: ctx.now + SESSION_TTL_MS,
    },
    result,
    duplicate: false,
  };
}
