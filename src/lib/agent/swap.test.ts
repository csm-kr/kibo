import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import type { KioskData } from "@/types/menu";
import type { CartLine } from "@/types/session";
import { carryOver, swapTracker } from "./swap";

const malo = getKiosk("malo");

const CHEESE: CartLine = {
  lineId: "line0000cheese01",
  itemId: "cheese_burger",
  variant: "set",
  qty: 1,
  selections: { side: ["fries_l"], drink: ["cider"], ingredients: ["no_pickles"] },
  unitPrice: 7700,
};

const ok = (cart: CartLine[]) => ({ ok: true as const, response: { ok: true as const, status: "ordering" as const, cart, total: 0, cartVersion: 1 } });
const refused = { ok: false as const, error: { code: "NEEDS_CHOICE", message: "Please choose a drink." } };

describe("carryOver (16-judge-r3-fixes:1)", () => {
  it("fills the side, drink and removals the replaced line had and the new item offers", () => {
    expect(carryOver(malo, CHEESE, { itemId: "bulgogi_burger", variant: "set" })).toEqual({
      itemId: "bulgogi_burger",
      variant: "set",
      options: [
        { groupId: "side", optionIds: ["fries_l"] },
        { groupId: "drink", optionIds: ["cider"] },
        { groupId: "ingredients", optionIds: ["no_pickles"] },
      ],
    });
  });

  it("keeps what the user said now, and an empty list that drops a choice", () => {
    const out = carryOver(malo, CHEESE, {
      itemId: "bulgogi_burger",
      variant: "set",
      options: [{ groupId: "drink", optionIds: ["cola"] }, { groupId: "ingredients", optionIds: [] }],
    });
    expect(out).toEqual({
      itemId: "bulgogi_burger",
      variant: "set",
      options: [
        { groupId: "drink", optionIds: ["cola"] },
        { groupId: "ingredients", optionIds: [] },
        { groupId: "side", optionIds: ["fries_l"] },
      ],
    });
  });

  it("takes the replaced line's single or set when the user did not say", () => {
    expect(carryOver(malo, CHEESE, { itemId: "bulgogi_burger" })).toMatchObject({ variant: "set" });
  });

  it("never carries a group the new item or variant does not have", () => {
    // A single has no side or drink group.
    expect(carryOver(malo, CHEESE, { itemId: "bulgogi_burger", variant: "single" })).toEqual({
      itemId: "bulgogi_burger",
      variant: "single",
      options: [{ groupId: "ingredients", optionIds: ["no_pickles"] }],
    });
    // A drink line's size group is not on a burger.
    const cola: CartLine = { ...CHEESE, itemId: "cola", variant: "single", selections: { size: ["l"] } };
    expect(carryOver(malo, cola, { itemId: "bulgogi_burger", variant: "set" })).toEqual({ itemId: "bulgogi_burger", variant: "set" });
  });

  it("never carries an option the new item's group does not offer, or one that is sold out there", () => {
    const k: KioskData = structuredClone(malo);
    const drink = k.items.find((i) => i.itemId === "bulgogi_burger")!.optionGroups.find((g) => g.groupId === "drink")!;
    drink.options.find((o) => o.optionId === "cider")!.soldOut = true;
    const odd: CartLine = { ...CHEESE, selections: { side: ["not_an_option"], drink: ["cider"] } };
    expect(carryOver(k, odd, { itemId: "bulgogi_burger", variant: "set" })).toEqual({ itemId: "bulgogi_burger", variant: "set" });
  });

  it("leaves arguments it cannot read unchanged", () => {
    expect(carryOver(malo, CHEESE, { itemId: "not_on_menu" })).toEqual({ itemId: "not_on_menu" });
    expect(carryOver(malo, CHEESE, "nonsense")).toBe("nonsense");
  });
});

describe("swapTracker", () => {
  it("a remove then an add in one batch: the add gets the removed line's choices", () => {
    const t = swapTracker(malo);
    t.after("removeFromCart", ok([]), [CHEESE]);
    expect(t.args("addToCart", { itemId: "bulgogi_burger", variant: "set" })).toMatchObject({
      options: expect.arrayContaining([{ groupId: "drink", optionIds: ["cider"] }]),
    });
  });

  it("an undo that took one line out counts as a removal", () => {
    const t = swapTracker(malo);
    t.after("undoLastChange", ok([]), [CHEESE]);
    expect(t.args("addToCart", { itemId: "bulgogi_burger", variant: "set" })).toHaveProperty("options");
  });

  it("no removal, a failed removal, or two removals: nothing is carried", () => {
    const args = { itemId: "bulgogi_burger", variant: "set" };
    const none = swapTracker(malo);
    expect(none.args("addToCart", args)).toEqual(args);

    const failed = swapTracker(malo);
    failed.after("removeFromCart", refused, [CHEESE]);
    expect(failed.args("addToCart", args)).toEqual(args);

    const two = swapTracker(malo);
    const other: CartLine = { ...CHEESE, lineId: "line0000other002" };
    two.after("removeFromCart", ok([other]), [CHEESE, other]);
    two.after("removeFromCart", ok([]), [other]);
    expect(two.args("addToCart", args)).toEqual(args);
  });

  it("only the first add that goes in takes the choices; a refused add keeps them for the retry", () => {
    const t = swapTracker(malo);
    const args = { itemId: "bulgogi_burger", variant: "set" };
    t.after("removeFromCart", ok([]), [CHEESE]);
    t.after("addToCart", refused, []);
    expect(t.args("addToCart", args)).toHaveProperty("options");
    t.after("addToCart", ok([CHEESE]), []);
    expect(t.args("addToCart", args)).toEqual(args);
  });

  it("other tools never change their arguments", () => {
    const t = swapTracker(malo);
    t.after("removeFromCart", ok([]), [CHEESE]);
    const args = { lineId: "line0000cheese01", qty: 2 };
    expect(t.args("updateCart", args)).toBe(args);
  });
});
