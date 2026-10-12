import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import type { Actor, Session, Source } from "@/types/session";
import { ACTOR_COMMANDS } from "./actors";
import { CommandError } from "./errors";
import { applyCommand, type CommandContext } from "./machine";
import { type Command, parseCommand } from "./schemas";
import { newSession, SESSION_TTL_MS } from "./session";

const k = getKiosk("malo");
/** 2026-10-12 14:00 KST */
const T0 = Date.UTC(2026, 9, 12, 5, 0);

const SET_ORDER = { itemId: "cheese_burger", variant: "set", selections: { drink: ["cola"] } };

let seq = 0;
function cmd(type: string, args: object = {}, extra: Record<string, unknown> = {}): Command {
  return parseCommand({ sessionId: "s1", commandId: `c${++seq}`, type, args, source: "touch", ...extra });
}

function ctx(actor: Actor, now = T0 + 1000): CommandContext {
  let line = 0;
  return { actor, now, kiosk: k, newLineId: () => `l${++line}`, newOrderNumber: () => 101 };
}

function catchError(fn: () => unknown): CommandError {
  try {
    fn();
  } catch (e) {
    if (e instanceof CommandError) return e;
    throw e;
  }
  throw new Error("expected a CommandError");
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

function fresh(): Session {
  return newSession({ sessionId: "s1", kioskId: "malo", demo: false, now: T0 });
}

/** Applies commands in order and returns the final session. */
function run(s: Session, steps: [Command, CommandContext][]): Session {
  for (const [c, x] of steps) s = applyCommand(s, c, x).session;
  return s;
}

/** A kiosk session in `ordering` with a dine option and one cheeseburger set. */
function ordering(): Session {
  return run(fresh(), [
    [cmd("startTouch"), ctx("kiosk")],
    [cmd("setDineOption", { option: "eat_in" }), ctx("kiosk")],
    [cmd("addToCart", SET_ORDER), ctx("kiosk")],
  ]);
}

/** A phone session in `confirming`; requestCheckout came with utteranceSeq 3 at T0 + 2000. */
function phoneConfirming(): Session {
  const s = { ...fresh(), status: "connected" as const };
  return run(s, [
    [cmd("setDineOption", { option: "take_out" }, { source: "voice", utteranceSeq: 1 }), ctx("phone")],
    [cmd("addToCart", SET_ORDER, { source: "voice", utteranceSeq: 2 }), ctx("phone")],
    [cmd("requestCheckout", {}, { source: "voice", utteranceSeq: 3 }), ctx("phone", T0 + 2000)],
  ]);
}

function confirm(s: Session, actor: Actor, source: Source, now: number, extra: Record<string, unknown> = {}) {
  return applyCommand(s, cmd("confirmCheckout", {}, { source, cartVersion: s.cartVersion, ...extra }), ctx(actor, now));
}

describe("newSession", () => {
  it("starts idle with an empty cart and a 10 minute expiry", () => {
    const s = fresh();
    expect(s.status).toBe("idle");
    expect(s.cart).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.cartVersion).toBe(0);
    expect(s.dineOption).toBeNull();
    expect(s.expiresAt).toBe(T0 + SESSION_TTL_MS);
    expect(SESSION_TTL_MS).toBe(10 * 60 * 1000);
  });
});

describe("parseCommand", () => {
  const base = { sessionId: "s1", commandId: "c1", source: "touch" };

  it("accepts a valid addToCart", () => {
    const c = parseCommand({ ...base, type: "addToCart", args: { itemId: "cheese_burger", variant: "set", qty: 2 } });
    expect(c.type).toBe("addToCart");
  });

  it.each([
    ["unknown type", { ...base, type: "payNow", args: {} }],
    ["unknown envelope key", { ...base, type: "startTouch", args: {}, extra: 1 }],
    ["unknown args key", { ...base, type: "startTouch", args: { force: true } }],
    ["negative qty", { ...base, type: "addToCart", args: { itemId: "cola", qty: -1 } }],
    ["huge qty", { ...base, type: "addToCart", args: { itemId: "cola", qty: 1000 } }],
    ["fractional qty", { ...base, type: "addToCart", args: { itemId: "cola", qty: 1.5 } }],
    ["long id", { ...base, type: "addToCart", args: { itemId: "a".repeat(65) } }],
    ["id with spaces", { ...base, type: "addToCart", args: { itemId: "cheese burger" } }],
    ["unknown variant", { ...base, type: "addToCart", args: { itemId: "cola", variant: "mega" } }],
    ["too many groups", {
      ...base,
      type: "addToCart",
      args: { itemId: "cola", selections: { a: [], b: [], c: [], d: [], e: [], f: [], g: [] } },
    }],
    ["too many options", { ...base, type: "addToCart", args: { itemId: "cola", selections: { a: ["1", "2", "3", "4", "5", "6", "7"] } } }],
    ["empty update", { ...base, type: "updateCart", args: { lineId: "l1", changes: {} } }],
    ["too many choices", {
      ...base,
      type: "offerChoices",
      args: { templateId: "pick_item", choices: Array.from({ length: 7 }, () => ({ kind: "item", id: "cola" })) },
    }],
    ["no choices", { ...base, type: "offerChoices", args: { templateId: "pick_item", choices: [] } }],
    ["unknown template", { ...base, type: "offerChoices", args: { templateId: "free_text", choices: [{ kind: "item", id: "cola" }] } }],
    ["free-text staff reason", { ...base, type: "callStaff", args: { reasonCode: "my halal question" } }],
    ["bad dine option", { ...base, type: "setDineOption", args: { option: "drive_thru" } }],
    ["bad source", { ...base, source: "ai", type: "startTouch", args: {} }],
    ["empty commandId", { ...base, commandId: "", type: "startTouch", args: {} }],
    ["long commandId", { ...base, commandId: "x".repeat(129), type: "startTouch", args: {} }],
    ["negative cartVersion", { ...base, type: "confirmCheckout", args: {}, cartVersion: -1 }],
    ["not an object", "startTouch"],
  ])("rejects %s with BAD_REQUEST", (_name, body) => {
    expect(catchError(() => parseCommand(body)).code).toBe("BAD_REQUEST");
  });
});

describe("actors", () => {
  it("matches the ARCHITECTURE command table", () => {
    expect([...ACTOR_COMMANDS.phone].sort()).toEqual([
      "addToCart", "callStaff", "cancelCheckout", "confirmCheckout", "offerChoices",
      "removeFromCart", "requestCheckout", "setDineOption", "undoLastChange", "updateCart",
    ]);
    expect([...ACTOR_COMMANDS.kiosk].sort()).toEqual([
      "addToCart", "callStaff", "cancelCheckout", "cardAction", "clearCart", "confirmCheckout", "editOrder",
      "reissueClaim", "removeFromCart", "requestCheckout", "setDineOption", "startTouch", "undoLastChange", "updateCart",
    ]);
  });

  it.each(["cardAction", "editOrder", "startTouch", "clearCart", "reissueClaim"])("a phone cannot send %s", (type) => {
    const s = { ...fresh(), status: "paying" as const };
    expect(catchError(() => applyCommand(s, cmd(type, {}, { source: "button" }), ctx("phone"))).code).toBe("FORBIDDEN");
  });

  it("a kiosk cannot send offerChoices", () => {
    const c = cmd("offerChoices", { templateId: "pick_item", choices: [{ kind: "item", id: "cola" }] });
    expect(catchError(() => applyCommand(ordering(), c, ctx("kiosk"))).code).toBe("FORBIDDEN");
  });
});

describe("idempotency", () => {
  it("a repeated commandId applies nothing and reports duplicate", () => {
    const s = ordering();
    const add = cmd("addToCart", { itemId: "cola" });
    const first = applyCommand(s, add, ctx("kiosk"));
    expect(first.duplicate).toBe(false);
    const again = applyCommand(first.session, add, ctx("kiosk"));
    expect(again.duplicate).toBe(true);
    expect(again.session).toBe(first.session);
    expect(again.session.cart).toHaveLength(2);
  });

  it("a retry after another command slipped in between still applies nothing", () => {
    const add = cmd("addToCart", { itemId: "cola" });
    let s = applyCommand(ordering(), add, ctx("kiosk")).session;
    s = applyCommand(s, cmd("addToCart", { itemId: "apple_pie" }), ctx("kiosk")).session;
    const retry = applyCommand(s, add, ctx("kiosk"));
    expect(retry.duplicate).toBe(true);
    expect(retry.session.cart.map((l) => [l.itemId, l.qty])).toEqual([
      ["cheese_burger", 1],
      ["cola", 1],
      ["apple_pie", 1],
    ]);
  });

  it("keeps only the last 30 commandIds", () => {
    let s = ordering();
    const ids: string[] = [];
    for (let i = 0; i < 35; i++) {
      const c = cmd("callStaff", { reasonCode: "stuck" });
      ids.push(c.commandId);
      s = applyCommand(s, c, ctx("kiosk")).session;
    }
    expect(s.recentCommandIds).toHaveLength(30);
    expect(s.recentCommandIds).toEqual(ids.slice(-30));
  });
});

describe("touch happy path", () => {
  it("startTouch → dine → add → checkout → confirm → card ends paid with an order number", () => {
    let s = fresh();
    s = applyCommand(s, cmd("startTouch"), ctx("kiosk")).session;
    expect(s.status).toBe("ordering");
    s = applyCommand(s, cmd("setDineOption", { option: "eat_in" }), ctx("kiosk")).session;
    expect(s.dineOption).toBe("eat_in");
    const added = applyCommand(s, cmd("addToCart", SET_ORDER), ctx("kiosk"));
    s = added.session;
    expect(added.result.lineId).toBe("l1");
    expect(s.cartVersion).toBe(1);
    expect(s.total).toBe(s.cart[0].unitPrice);
    expect(s.lastChange).toEqual({ lineId: "l1", kind: "add", source: "touch", at: T0 + 1000 });
    expect(s.screen).toEqual({ category: "burger", itemId: "cheese_burger" });
    s = applyCommand(s, cmd("requestCheckout"), ctx("kiosk")).session;
    expect(s.status).toBe("confirming");
    s = confirm(s, "kiosk", "touch", T0 + 1000).session;
    expect(s.status).toBe("paying");
    s = applyCommand(s, cmd("cardAction"), ctx("kiosk", T0 + 5000)).session;
    expect(s.status).toBe("paid");
    expect(s.orderNumber).toBe(101);
    expect(s.paidAt).toBe(T0 + 5000);
  });

  it("startTouch in ordering is an accepted no-op", () => {
    const s = ordering();
    const out = applyCommand(s, cmd("startTouch"), ctx("kiosk"));
    expect(out.session.status).toBe("ordering");
    expect(out.session.cart).toEqual(s.cart);
  });

  it("the kiosk may set the dine option straight from idle", () => {
    const s = applyCommand(fresh(), cmd("setDineOption", { option: "take_out" }), ctx("kiosk")).session;
    expect(s.status).toBe("ordering");
  });

  it("cart changes are refused in idle", () => {
    expect(catchError(() => applyCommand(fresh(), cmd("addToCart", SET_ORDER), ctx("kiosk"))).code).toBe("CONFLICT");
  });
});

describe("payment safety", () => {
  it("no payment without confirming", () => {
    const s = ordering();
    expect(catchError(() => confirm(s, "kiosk", "touch", T0 + 1000)).code).toBe("CONFLICT");
    expect(catchError(() => applyCommand(s, cmd("cardAction"), ctx("kiosk"))).code).toBe("CONFLICT");
  });

  it("cardAction needs paying, even from confirming", () => {
    const s = applyCommand(ordering(), cmd("requestCheckout"), ctx("kiosk")).session;
    expect(catchError(() => applyCommand(s, cmd("cardAction"), ctx("kiosk"))).code).toBe("CONFLICT");
  });

  it("confirmCheckout with a stale or missing cartVersion → CONFLICT", () => {
    const s = applyCommand(ordering(), cmd("requestCheckout"), ctx("kiosk")).session;
    expect(catchError(() => confirm(s, "kiosk", "touch", T0 + 1000, { cartVersion: s.cartVersion - 1 })).code).toBe(
      "CONFLICT",
    );
    expect(catchError(() => confirm(s, "kiosk", "touch", T0 + 1000, { cartVersion: undefined })).code).toBe("CONFLICT");
  });

  it("an AI confirm with the same utteranceSeq as requestCheckout → CONFLICT", () => {
    const s = phoneConfirming();
    expect(catchError(() => confirm(s, "phone", "voice", T0 + 10000, { utteranceSeq: 3 })).code).toBe("CONFLICT");
  });

  it("an AI confirm with a higher seq but 1.0 s later → CONFLICT", () => {
    const s = phoneConfirming();
    expect(catchError(() => confirm(s, "phone", "voice", T0 + 3000, { utteranceSeq: 4 })).code).toBe("CONFLICT");
  });

  it("an AI confirm without utteranceSeq → CONFLICT", () => {
    const s = phoneConfirming();
    expect(catchError(() => confirm(s, "phone", "text", T0 + 10000)).code).toBe("CONFLICT");
  });

  it("an AI confirm with a higher seq and 1.6 s later → paying", () => {
    const s = phoneConfirming();
    expect(confirm(s, "phone", "voice", T0 + 3600, { utteranceSeq: 4 }).session.status).toBe("paying");
  });

  it("a confirm-card tap from the phone needs no utterance", () => {
    const s = phoneConfirming();
    expect(confirm(s, "phone", "button", T0 + 2000).session.status).toBe("paying");
  });

  it("a kiosk confirm must come from touch", () => {
    const s = applyCommand(ordering(), cmd("requestCheckout"), ctx("kiosk")).session;
    expect(catchError(() => confirm(s, "kiosk", "voice", T0 + 10000, { utteranceSeq: 9 })).code).toBe("CONFLICT");
  });

  it("requestCheckout on an empty cart → CONFLICT", () => {
    const s = run(fresh(), [[cmd("startTouch"), ctx("kiosk")]]);
    expect(catchError(() => applyCommand(s, cmd("requestCheckout"), ctx("kiosk"))).code).toBe("CONFLICT");
  });

  it("editOrder goes paying → confirming and restarts the 1.5 s wait", () => {
    let s = phoneConfirming();
    s = confirm(s, "phone", "button", T0 + 2000).session;
    s = applyCommand(s, cmd("editOrder"), ctx("kiosk", T0 + 20000)).session;
    expect(s.status).toBe("confirming");
    expect(catchError(() => confirm(s, "phone", "voice", T0 + 20500, { utteranceSeq: 5 })).code).toBe("CONFLICT");
    expect(confirm(s, "phone", "voice", T0 + 21600, { utteranceSeq: 5 }).session.status).toBe("paying");
  });

  it("cancelCheckout returns to ordering with the cart unchanged", () => {
    const s = phoneConfirming();
    const out = applyCommand(s, cmd("cancelCheckout", {}, { source: "button" }), ctx("phone")).session;
    expect(out.status).toBe("ordering");
    expect(out.cart).toEqual(s.cart);
    expect(out.cartVersion).toBe(s.cartVersion);
  });

  it("paid accepts nothing but callStaff", () => {
    let s = applyCommand(ordering(), cmd("requestCheckout"), ctx("kiosk")).session;
    s = confirm(s, "kiosk", "touch", T0 + 1000).session;
    s = applyCommand(s, cmd("cardAction"), ctx("kiosk")).session;
    expect(catchError(() => applyCommand(s, cmd("addToCart", { itemId: "cola" }), ctx("kiosk"))).code).toBe("CONFLICT");
    expect(catchError(() => applyCommand(s, cmd("cardAction"), ctx("kiosk"))).code).toBe("CONFLICT");
    const staff = applyCommand(s, cmd("callStaff", { reasonCode: "stuck" }), ctx("kiosk")).session;
    expect(staff.staffCalled).toEqual({ reasonCode: "stuck", at: T0 + 1000 });
    expect(staff.status).toBe("paid");
  });

  it("reissueClaim is refused from paying", () => {
    let s = applyCommand(ordering(), cmd("requestCheckout"), ctx("kiosk")).session;
    expect(applyCommand(s, cmd("reissueClaim"), ctx("kiosk")).session.status).toBe("confirming");
    s = confirm(s, "kiosk", "touch", T0 + 1000).session;
    expect(catchError(() => applyCommand(s, cmd("reissueClaim"), ctx("kiosk"))).code).toBe("CONFLICT");
  });
});

describe("cart changes and undo", () => {
  it("a cart change in confirming goes back to ordering", () => {
    const s = phoneConfirming();
    const out = applyCommand(s, cmd("addToCart", { itemId: "cola" }, { source: "voice", utteranceSeq: 4 }), ctx("phone"));
    expect(out.session.status).toBe("ordering");
    expect(out.session.cartVersion).toBe(s.cartVersion + 1);
  });

  it("addToCart in connected → ordering without a dine option; requestCheckout then asks for it", () => {
    let s: Session = { ...fresh(), status: "connected" };
    s = applyCommand(s, cmd("addToCart", SET_ORDER, { source: "voice", utteranceSeq: 1 }), ctx("phone")).session;
    expect(s.status).toBe("ordering");
    expect(s.dineOption).toBeNull();
    const e = catchError(() => applyCommand(s, cmd("requestCheckout", {}, { source: "voice" }), ctx("phone")));
    expect(e.code).toBe("NEEDS_CHOICE");
    expect(e.detail).toEqual({
      templateId: "pick_dine",
      choices: [
        { kind: "dine", id: "eat_in" },
        { kind: "dine", id: "take_out" },
      ],
    });
  });

  it("updateCart and removeFromCart change the line and bump cartVersion", () => {
    let s = ordering();
    s = applyCommand(s, cmd("updateCart", { lineId: "l1", changes: { qty: 2 } }), ctx("kiosk")).session;
    expect(s.cart[0].qty).toBe(2);
    expect(s.total).toBe(s.cart[0].unitPrice * 2);
    expect(s.lastChange?.kind).toBe("update");
    s = applyCommand(s, cmd("removeFromCart", { lineId: "l1" }), ctx("kiosk")).session;
    expect(s.cart).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.cartVersion).toBe(3);
    expect(s.lastChange).toMatchObject({ lineId: "l1", kind: "remove" });
  });

  it("clearCart empties the cart and returns to ordering", () => {
    const s = applyCommand(ordering(), cmd("requestCheckout"), ctx("kiosk")).session;
    const out = applyCommand(s, cmd("clearCart"), ctx("kiosk")).session;
    expect(out.status).toBe("ordering");
    expect(out.cart).toEqual([]);
    expect(out.lastChange).toMatchObject({ lineId: null, kind: "clear" });
    expect(out.undoStack.at(-1)).toEqual(s.cart);
  });

  it("undo restores the previous cart and bumps cartVersion", () => {
    const before = ordering();
    const added = applyCommand(before, cmd("addToCart", { itemId: "cola" }), ctx("kiosk")).session;
    const undone = applyCommand(added, cmd("undoLastChange"), ctx("kiosk")).session;
    expect(undone.cart).toEqual(before.cart);
    expect(undone.total).toBe(before.total);
    expect(undone.cartVersion).toBe(added.cartVersion + 1);
    expect(undone.undoStack).toEqual(before.undoStack);
    expect(undone.lastChange).toMatchObject({ kind: "undo" });
  });

  it("undo in confirming returns to ordering", () => {
    const s = phoneConfirming();
    const out = applyCommand(s, cmd("undoLastChange", {}, { source: "button" }), ctx("phone")).session;
    expect(out.status).toBe("ordering");
    expect(out.cart).toEqual([]);
  });

  it("undo with nothing to undo → CONFLICT", () => {
    const s = run(fresh(), [[cmd("startTouch"), ctx("kiosk")]]);
    expect(catchError(() => applyCommand(s, cmd("undoLastChange"), ctx("kiosk"))).code).toBe("CONFLICT");
  });

  it("undo is refused in paying", () => {
    let s = applyCommand(ordering(), cmd("requestCheckout"), ctx("kiosk")).session;
    s = confirm(s, "kiosk", "touch", T0 + 1000).session;
    expect(catchError(() => applyCommand(s, cmd("undoLastChange"), ctx("kiosk"))).code).toBe("CONFLICT");
  });

  it("keeps only the last 5 carts on the undo stack", () => {
    let s = ordering();
    for (let i = 0; i < 7; i++) s = applyCommand(s, cmd("addToCart", { itemId: "cola" }), ctx("kiosk")).session;
    expect(s.undoStack).toHaveLength(5);
    expect(s.undoStack.at(-1)?.find((l) => l.itemId === "cola")?.qty).toBe(6);
  });

  it("a rejected cart change leaves the session as it was", () => {
    const s = deepFreeze(ordering());
    expect(catchError(() => applyCommand(s, cmd("addToCart", { itemId: "shrimp_burger", variant: "single" }), ctx("kiosk"))).code).toBe(
      "SOLD_OUT",
    );
  });
});

describe("upsell", () => {
  it("the first burger add offers soft_cone and apple_pie; the second does not", () => {
    const s = run(fresh(), [[cmd("startTouch"), ctx("kiosk")]]);
    const first = applyCommand(s, cmd("addToCart", SET_ORDER), ctx("kiosk"));
    expect(first.result.upsell).toEqual({ offerItemIds: ["soft_cone", "apple_pie"] });
    expect(first.session.upsellOffered).toBe(true);
    const second = applyCommand(first.session, cmd("addToCart", { itemId: "bulgogi_burger", variant: "single" }), ctx("kiosk"));
    expect(second.result.upsell).toBeUndefined();
  });

  it("adding a dessert first does not trigger it", () => {
    const s = run(fresh(), [[cmd("startTouch"), ctx("kiosk")]]);
    const out = applyCommand(s, cmd("addToCart", { itemId: "apple_pie" }), ctx("kiosk"));
    expect(out.result.upsell).toBeUndefined();
    expect(out.session.upsellOffered).toBe(false);
  });
});

describe("offerChoices", () => {
  const phoneOrdering = (): Session => ({ ...fresh(), status: "ordering" });

  it("sets pendingChoice from catalog ids, and the next accepted command clears it", () => {
    const choices = [
      { kind: "item", id: "cheese_burger" },
      { kind: "item", id: "bulgogi_burger" },
    ];
    let s = applyCommand(phoneOrdering(), cmd("offerChoices", { templateId: "pick_item", choices }, { source: "voice" }), ctx("phone"))
      .session;
    expect(s.pendingChoice).toEqual({ templateId: "pick_item", choices });
    expect(s.cartVersion).toBe(0);
    s = applyCommand(s, cmd("setDineOption", { option: "eat_in" }, { source: "button" }), ctx("phone")).session;
    expect(s.pendingChoice).toBeNull();
  });

  it.each([
    ["item", "pizza"],
    ["variant", "mega"],
    ["option", "extra_cream"],
    ["dine", "drive_thru"],
    ["yesno", "maybe"],
  ])("rejects an unknown %s id", (kind, id) => {
    const c = cmd("offerChoices", { templateId: "pick_item", choices: [{ kind, id }] }, { source: "voice" });
    expect(catchError(() => applyCommand(phoneOrdering(), c, ctx("phone"))).code).toBe("BAD_REQUEST");
  });

  it("accepts every valid kind", () => {
    const choices = [
      { kind: "variant", id: "largeSet" },
      { kind: "option", id: "zero_cola" },
      { kind: "dine", id: "take_out" },
      { kind: "yesno", id: "no" },
    ];
    const c = cmd("offerChoices", { templateId: "pick_option", choices }, { source: "voice" });
    expect(applyCommand(phoneOrdering(), c, ctx("phone")).session.pendingChoice?.choices).toEqual(choices);
  });

  it("is refused once paying", () => {
    const s: Session = { ...fresh(), status: "paying" };
    const c = cmd("offerChoices", { templateId: "yes_no", choices: [{ kind: "yesno", id: "yes" }] }, { source: "voice" });
    expect(catchError(() => applyCommand(s, c, ctx("phone"))).code).toBe("CONFLICT");
  });
});

describe("expiry and bookkeeping", () => {
  it("an expired status or a passed expiresAt → GONE", () => {
    const expired: Session = { ...fresh(), status: "expired" };
    expect(catchError(() => applyCommand(expired, cmd("callStaff", { reasonCode: "stuck" }), ctx("kiosk"))).code).toBe("GONE");
    const late = ctx("kiosk", T0 + SESSION_TTL_MS + 1);
    expect(catchError(() => applyCommand(fresh(), cmd("startTouch"), late)).code).toBe("GONE");
  });

  it("every accepted command extends expiresAt and sets lastSeenAt", () => {
    const now = T0 + 5 * 60 * 1000;
    const s = applyCommand(fresh(), cmd("startTouch"), ctx("kiosk", now)).session;
    expect(s.lastSeenAt).toBe(now);
    expect(s.expiresAt).toBe(now + SESSION_TTL_MS);
  });

  it("never mutates its inputs", () => {
    const s = deepFreeze(phoneConfirming());
    const c = deepFreeze(cmd("addToCart", { itemId: "cola" }, { source: "voice", utteranceSeq: 4 }));
    const snapshot = structuredClone(s);
    const out = applyCommand(s, c, ctx("phone"));
    expect(s).toEqual(snapshot);
    expect(out.session).not.toBe(s);
  });
});
