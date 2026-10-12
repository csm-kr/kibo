import { describe, expect, it } from "vitest";
import { findItem, getKiosk } from "@/lib/adapters/catalog";
import type { CartLine, LineInput } from "@/types/session";
import {
  addLine,
  cartTotal,
  MAX_LINES,
  MAX_QTY,
  removeLine,
  resolveLine,
  sameLine,
  unitPriceOf,
  updateLine,
} from "./cart";
import { CommandError, HTTP_STATUS } from "./errors";

const k = getKiosk("malo");
/** 2026-10-12 14:00 KST */
const AFTERNOON = Date.UTC(2026, 9, 12, 5, 0);
/** 2026-10-12 08:00 KST */
const MORNING = Date.UTC(2026, 9, 11, 23, 0);

function ids() {
  let n = 0;
  return () => `L${++n}`;
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

function heroCart(): CartLine[] {
  const next = ids();
  let cart: CartLine[] = [];
  cart = addLine(k, cart, {
    itemId: "cheese_burger",
    variant: "set",
    qty: 1,
    selections: { ingredients: ["no_pickles"], drink: ["zero_cola"] },
  }, AFTERNOON, next).cart;
  cart = addLine(k, cart, {
    itemId: "cheese_burger",
    variant: "set",
    selections: { drink: ["cider"] },
  }, AFTERNOON, next).cart;
  return cart;
}

describe("hero order", () => {
  it("two cheeseburger sets become two lines with the default side", () => {
    const cart = heroCart();
    expect(cart).toHaveLength(2);
    expect(cart[0]).toEqual({
      lineId: "L1",
      itemId: "cheese_burger",
      variant: "set",
      qty: 1,
      selections: { side: ["fries_m"], drink: ["zero_cola"], ingredients: ["no_pickles"] },
      unitPrice: 6900,
    });
    expect(cart[1].selections).toEqual({ side: ["fries_m"], drink: ["cider"] });
    expect(cart[1].unitPrice).toBe(6900);
    expect(cartTotal(cart)).toBe(13800);
  });

  it("make both fries large edits the existing lines", () => {
    let cart = heroCart();
    for (const line of cart) {
      cart = updateLine(k, cart, line.lineId, { selections: { side: ["fries_l"] } }, AFTERNOON);
    }
    expect(cart).toHaveLength(2);
    expect(cart.map((l) => l.unitPrice)).toEqual([7400, 7400]);
    expect(cartTotal(cart)).toBe(14800);
    expect(cart[0].selections).toEqual({ side: ["fries_l"], drink: ["zero_cola"], ingredients: ["no_pickles"] });
    expect(cart[1].selections).toEqual({ side: ["fries_l"], drink: ["cider"] });
  });
});

describe("required choices", () => {
  it("a set without a drink asks for one of 4 drinks", () => {
    const e = catchError(() => resolveLine(k, { itemId: "cheese_burger", variant: "set" }, AFTERNOON));
    expect(e.code).toBe("NEEDS_CHOICE");
    expect(e.message).toBe("Please choose a drink.");
    expect(e.detail).toEqual({
      templateId: "pick_option",
      itemId: "cheese_burger",
      groupId: "drink",
      choices: ["cola", "zero_cola", "cider", "iced_coffee"].map((id) => ({ kind: "option", id })),
    });
  });

  it("nuggets without a sauce ask for a sauce", () => {
    const e = catchError(() => resolveLine(k, { itemId: "chicken_nuggets" }, AFTERNOON));
    expect(e.code).toBe("NEEDS_CHOICE");
    expect(e.detail?.groupId).toBe("sauce");
    expect(e.detail?.choices).toHaveLength(3);
  });

  it("a burger without a variant asks single, set or large set", () => {
    const e = catchError(() => resolveLine(k, { itemId: "cheese_burger" }, AFTERNOON));
    expect(e.code).toBe("NEEDS_CHOICE");
    expect(e.detail).toEqual({
      templateId: "pick_variant",
      itemId: "cheese_burger",
      choices: ["single", "set", "largeSet"].map((id) => ({ kind: "variant", id })),
    });
  });

  it("an item with one variant uses it", () => {
    expect(resolveLine(k, { itemId: "apple_pie" }, AFTERNOON)).toEqual({
      itemId: "apple_pie",
      variant: "single",
      qty: 1,
      selections: {},
      unitPrice: 1600,
    });
  });

  it("a drink defaults its size", () => {
    const line = resolveLine(k, { itemId: "cola", qty: 2 }, AFTERNOON);
    expect(line.selections).toEqual({ size: ["m"] });
    expect(line.unitPrice).toBe(1800);
  });
});

describe("sold out and hours", () => {
  it("shrimp burger is sold out with burger alternatives", () => {
    const e = catchError(() => resolveLine(k, { itemId: "shrimp_burger", variant: "single" }, AFTERNOON));
    expect(e.code).toBe("SOLD_OUT");
    expect(e.detail?.templateId).toBe("alternatives");
    const choices = e.detail?.choices ?? [];
    expect(choices.length).toBeGreaterThanOrEqual(1);
    expect(choices.length).toBeLessThanOrEqual(2);
    for (const c of choices) {
      const item = findItem(k, c.id);
      expect(c.kind).toBe("item");
      expect(item?.category).toBe("burger");
      expect(item?.soldOut).toBe(false);
    }
    expect(e.message).not.toContain("shrimp_burger");
  });

  it("a morning item at 14:00 KST is unavailable", () => {
    const e = catchError(() => resolveLine(k, { itemId: "egg_muffin" }, AFTERNOON));
    expect(e.code).toBe("UNAVAILABLE");
    expect(e.detail?.templateId).toBe("alternatives");
    expect(e.detail?.choices).toEqual([]);
  });

  it("a morning item at 08:00 KST is fine", () => {
    expect(resolveLine(k, { itemId: "egg_muffin" }, MORNING).unitPrice).toBe(3200);
  });
});

describe("bad input", () => {
  it.each([0, 11, 1.5, -1])("qty %s is rejected", (qty) => {
    expect(catchError(() => resolveLine(k, { itemId: "apple_pie", qty }, AFTERNOON)).code).toBe("BAD_REQUEST");
  });

  it("unknown item is rejected", () => {
    const e = catchError(() => resolveLine(k, { itemId: "big_mac" }, AFTERNOON));
    expect(e.code).toBe("BAD_REQUEST");
    expect(e.message).not.toContain("big_mac");
  });

  it("a variant the item does not have is rejected", () => {
    expect(catchError(() => resolveLine(k, { itemId: "apple_pie", variant: "set" }, AFTERNOON)).code).toBe("BAD_REQUEST");
  });

  it("an option from another item's group is rejected", () => {
    const sauce = catchError(() =>
      resolveLine(k, { itemId: "cheese_burger", variant: "single", selections: { sauce: ["bbq"] } }, AFTERNOON),
    );
    expect(sauce.code).toBe("BAD_REQUEST");
    const foreign = catchError(() =>
      resolveLine(k, { itemId: "cheese_burger", variant: "set", selections: { drink: ["bbq"] } }, AFTERNOON),
    );
    expect(foreign.code).toBe("BAD_REQUEST");
  });

  it("a group that does not apply to the variant is rejected", () => {
    const e = catchError(() =>
      resolveLine(k, { itemId: "cheese_burger", variant: "single", selections: { drink: ["cola"] } }, AFTERNOON),
    );
    expect(e.code).toBe("BAD_REQUEST");
  });

  it("four ingredients (max 3) are rejected", () => {
    const e = catchError(() =>
      resolveLine(k, {
        itemId: "cheese_burger",
        variant: "single",
        selections: { ingredients: ["no_pickles", "no_onion", "extra_cheese", "extra_patty"] },
      }, AFTERNOON),
    );
    expect(e.code).toBe("BAD_REQUEST");
  });

  it("two drinks in a 1-drink group are rejected", () => {
    const e = catchError(() =>
      resolveLine(k, { itemId: "cheese_burger", variant: "set", selections: { drink: ["cola", "cider"] } }, AFTERNOON),
    );
    expect(e.code).toBe("BAD_REQUEST");
  });

  it("the 21st line is rejected", () => {
    const next = ids();
    let cart: CartLine[] = [];
    const items = k.items.filter((i) => !i.soldOut && !i.availableHours && i.optionGroups.length === 0);
    for (let n = 0; n < MAX_LINES; n++) {
      cart = addLine(k, cart, { itemId: items[n].itemId }, AFTERNOON, next).cart;
    }
    expect(cart).toHaveLength(20);
    const e = catchError(() => addLine(k, cart, { itemId: "cheese_burger", variant: "single" }, AFTERNOON, next));
    expect(e.code).toBe("BAD_REQUEST");
  });

  it("prices in the input are ignored", () => {
    const input = { itemId: "apple_pie", unitPrice: 1 } as LineInput;
    expect(resolveLine(k, input, AFTERNOON).unitPrice).toBe(1600);
  });
});

describe("option price and sold-out options", () => {
  it("adds option price deltas", () => {
    expect(unitPriceOf(k, "cheese_burger", "largeSet", {
      side: ["cheese_sticks"],
      drink: ["iced_coffee"],
      ingredients: ["extra_patty", "extra_cheese"],
    })).toBe(7600 + 1000 + 500 + 1500 + 500);
  });

  it("a sold-out option asks for another one", () => {
    const soldOutKiosk = structuredClone(k);
    const drink = soldOutKiosk.items.find((i) => i.itemId === "cheese_burger")!
      .optionGroups.find((g) => g.groupId === "drink")!;
    drink.options.find((o) => o.optionId === "cider")!.soldOut = true;
    const e = catchError(() =>
      resolveLine(soldOutKiosk, { itemId: "cheese_burger", variant: "set", selections: { drink: ["cider"] } }, AFTERNOON),
    );
    expect(e.code).toBe("SOLD_OUT");
    expect(e.detail).toEqual({
      templateId: "pick_option",
      itemId: "cheese_burger",
      groupId: "drink",
      choices: ["cola", "zero_cola", "iced_coffee"].map((id) => ({ kind: "option", id })),
    });
  });
});

describe("merging lines", () => {
  it("an identical add merges qty and returns the same lineId", () => {
    const next = ids();
    const input: LineInput = { itemId: "cheese_burger", variant: "set", selections: { drink: ["cola"] } };
    const first = addLine(k, [], input, AFTERNOON, next);
    const second = addLine(k, first.cart, {
      ...input,
      qty: 2,
      selections: { drink: ["cola"], side: ["fries_m"] },
    }, AFTERNOON, next);
    expect(second.lineId).toBe(first.lineId);
    expect(second.cart).toHaveLength(1);
    expect(second.cart[0].qty).toBe(3);
    expect(cartTotal(second.cart)).toBe(3 * 6900);
  });

  it("a merge above 10 is rejected", () => {
    const next = ids();
    const { cart } = addLine(k, [], { itemId: "apple_pie", qty: 6 }, AFTERNOON, next);
    expect(catchError(() => addLine(k, cart, { itemId: "apple_pie", qty: 5 }, AFTERNOON, next)).code).toBe("BAD_REQUEST");
    expect(addLine(k, cart, { itemId: "apple_pie", qty: 4 }, AFTERNOON, next).cart[0].qty).toBe(MAX_QTY);
  });

  it("different selections stay separate lines", () => {
    expect(heroCart().map((l) => l.lineId)).toEqual(["L1", "L2"]);
  });

  it("sameLine ignores selection order", () => {
    const a: CartLine = {
      lineId: "a", itemId: "cheese_burger", variant: "single", qty: 1, unitPrice: 4900,
      selections: { ingredients: ["no_pickles", "no_onion"] },
    };
    const b: CartLine = { ...a, lineId: "b", qty: 2, selections: { ingredients: ["no_onion", "no_pickles"] } };
    expect(sameLine(a, b)).toBe(true);
    expect(sameLine(a, { ...b, selections: { ingredients: ["no_onion"] } })).toBe(false);
    expect(sameLine(a, { ...b, variant: "set" })).toBe(false);
  });
});

describe("updateLine and removeLine", () => {
  it("set to single drops side and drink and reprices", () => {
    const cart = heroCart();
    const updated = updateLine(k, cart, "L1", { variant: "single" }, AFTERNOON);
    expect(updated[0].variant).toBe("single");
    expect(updated[0].selections).toEqual({ ingredients: ["no_pickles"] });
    expect(updated[0].unitPrice).toBe(4900);
    expect(updated[1]).toEqual(cart[1]);
  });

  it("single to set needs a drink", () => {
    const { cart } = addLine(k, [], { itemId: "cheese_burger", variant: "single" }, AFTERNOON, ids());
    expect(catchError(() => updateLine(k, cart, "L1", { variant: "set" }, AFTERNOON)).code).toBe("NEEDS_CHOICE");
  });

  it("qty change is validated", () => {
    const cart = heroCart();
    expect(updateLine(k, cart, "L2", { qty: 3 }, AFTERNOON)[1].qty).toBe(3);
    expect(catchError(() => updateLine(k, cart, "L2", { qty: 0 }, AFTERNOON)).code).toBe("BAD_REQUEST");
  });

  it("unknown lineId is rejected", () => {
    expect(catchError(() => updateLine(k, heroCart(), "nope", { qty: 2 }, AFTERNOON)).code).toBe("BAD_REQUEST");
  });

  it("removeLine removes one line", () => {
    const cart = heroCart();
    expect(removeLine(cart, "L1").map((l) => l.lineId)).toEqual(["L2"]);
    expect(catchError(() => removeLine(cart, "nope")).code).toBe("BAD_REQUEST");
  });

  it("inputs are not mutated", () => {
    const cart = heroCart();
    const snapshot = structuredClone(cart);
    const changes = { selections: { side: ["fries_l"] } };
    const input: LineInput = { itemId: "cheese_burger", variant: "set", selections: { drink: ["cola"] } };
    updateLine(k, cart, "L1", changes, AFTERNOON);
    updateLine(k, cart, "L2", { variant: "single" }, AFTERNOON);
    addLine(k, cart, input, AFTERNOON, ids());
    addLine(k, cart, { itemId: "cheese_burger", variant: "set", selections: { drink: ["cider"] } }, AFTERNOON, ids());
    removeLine(cart, "L1");
    expect(cart).toEqual(snapshot);
    expect(changes).toEqual({ selections: { side: ["fries_l"] } });
    expect(input).toEqual({ itemId: "cheese_burger", variant: "set", selections: { drink: ["cola"] } });
  });
});

describe("errors", () => {
  it("maps codes to HTTP status", () => {
    expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
    expect(HTTP_STATUS.NEEDS_CHOICE).toBe(422);
    expect(HTTP_STATUS.CONFLICT).toBe(409);
    expect(HTTP_STATUS.UPSTREAM).toBe(502);
  });
});
