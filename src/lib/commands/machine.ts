import { findItem, isAvailableNow } from "@/lib/adapters/catalog";
import type { KioskData } from "@/types/menu";
import type { Actor, CartLine, ChangeKind, Session, SessionStatus } from "@/types/session";
import { ACTOR_COMMANDS } from "./actors";
import { addLine, cartTotal, removeLine, updateLine } from "./cart";
import { type ChoiceRef, CommandError } from "./errors";
import type { Command } from "./schemas";
import { SESSION_TTL_MS } from "./session";

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
}

export interface CommandResult {
  upsell?: { offerItemIds: string[] };
  lineId?: string;
}

const BEFORE_PAYING: SessionStatus[] = ["idle", "connected", "ordering", "confirming"];
const CART_EDITABLE: SessionStatus[] = ["connected", "ordering", "confirming"];

function requireStatus(s: Session, allowed: SessionStatus[], message: string): void {
  if (!allowed.includes(s.status)) throw new CommandError("CONFLICT", message);
}

function withCart(
  s: Session,
  cmd: Command,
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
    lastChange: { lineId: change.lineId, kind: change.kind, source: cmd.source, at: ctx.now },
    screen: item ? { category: item.category, itemId: item.itemId } : s.screen,
  };
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
      return c.id === "eat_in" || c.id === "take_out";
    case "yesno":
      return c.id === "yes" || c.id === "no";
  }
}

function isConfirmed(s: Session, cmd: Command, ctx: CommandContext): boolean {
  if (ctx.actor === "kiosk") return cmd.source === "touch";
  if (cmd.source === "button") return true;
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
      const allowed: SessionStatus[] = ctx.actor === "kiosk" ? ["idle", ...CART_EDITABLE] : CART_EDITABLE;
      requireStatus(s, allowed, "The order can no longer be changed.");
      const status = s.status === "confirming" ? "confirming" : "ordering";
      return { next: { ...s, status, dineOption: cmd.args.option }, result: {} };
    }

    case "addToCart": {
      requireStatus(s, CART_EDITABLE, "Please start an order first.");
      const { cart, lineId } = addLine(k, s.cart, cmd.args, ctx.now, ctx.newLineId);
      let next = withCart(s, cmd, ctx, { cart, undoStack: pushUndo(s), lineId, kind: "add", itemId: cmd.args.itemId });
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
      return { next: withCart(s, cmd, ctx, { cart, undoStack: pushUndo(s), lineId, kind: "update", itemId }), result: {} };
    }

    case "removeFromCart": {
      requireStatus(s, CART_EDITABLE, "The order can no longer be changed.");
      const { lineId } = cmd.args;
      const cart = removeLine(s.cart, lineId);
      const itemId = lineItemId(s, lineId);
      return { next: withCart(s, cmd, ctx, { cart, undoStack: pushUndo(s), lineId, kind: "remove", itemId }), result: {} };
    }

    case "clearCart":
      requireStatus(s, ["ordering", "confirming"], "The order can no longer be changed.");
      return { next: withCart(s, cmd, ctx, { cart: [], undoStack: pushUndo(s), lineId: null, kind: "clear", itemId: null }), result: {} };

    case "undoLastChange": {
      requireStatus(s, BEFORE_PAYING, "The order can no longer be changed.");
      if (s.undoStack.length === 0) throw new CommandError("CONFLICT", "Nothing to undo.");
      const cart = s.undoStack[s.undoStack.length - 1];
      const undoStack = s.undoStack.slice(0, -1);
      return { next: withCart(s, cmd, ctx, { cart, undoStack, lineId: null, kind: "undo", itemId: null }), result: {} };
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
      if (s.dineOption === null) {
        throw new CommandError("NEEDS_CHOICE", "Eat here or take out?", {
          templateId: "pick_dine",
          choices: [
            { kind: "dine", id: "eat_in" },
            { kind: "dine", id: "take_out" },
          ],
        });
      }
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
  if (s.recentCommandIds.includes(cmd.commandId)) return { session: s, result: {}, duplicate: true };
  if (s.status === "expired" || ctx.now > s.expiresAt) {
    throw new CommandError("GONE", "This order has ended. Please start again at the kiosk.");
  }
  if (s.status === "paid" && cmd.type !== "callStaff") {
    throw new CommandError("CONFLICT", "This order is already paid.");
  }

  const { next, result } = transition(s, cmd, ctx);
  return {
    session: {
      ...next,
      pendingChoice: cmd.type === "offerChoices" ? next.pendingChoice : null,
      recentCommandIds: [...s.recentCommandIds, cmd.commandId].slice(-RECENT_COMMANDS),
      lastSeenAt: ctx.now,
      expiresAt: ctx.now + SESSION_TTL_MS,
    },
    result,
    duplicate: false,
  };
}
