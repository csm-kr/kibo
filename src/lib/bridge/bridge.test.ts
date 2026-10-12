import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import type { CartLine } from "@/types/session";
import { BridgeError, changeVars, expectedLines } from "./bridge";

const kiosk = getKiosk("doughhouse");

const pepperoniLine: CartLine = {
  lineId: "a1",
  itemId: "pepperoni",
  variant: "single",
  qty: 1,
  selections: { size: ["large"], dough: ["thin"], toppings: ["bacon", "olive"] },
  unitPrice: 24200,
};

describe("changeVars", () => {
  it("maps an add to kiosk labels by id, options in group order", () => {
    expect(
      changeVars(kiosk, {
        type: "addToCart",
        args: { itemId: "pepperoni", qty: 2, selections: { toppings: ["olive", "bacon"], size: ["large"], dough: ["thin"] } },
      }),
    ).toEqual({
      recipe: "addToCart",
      vars: { category: "피자", item: "페퍼로니", options: ["라지", "씬", "올리브", "베이컨"], qtyMinus1: 1 },
    });
  });

  it("maps the dine option and a removal", () => {
    expect(changeVars(kiosk, { type: "setDineOption", args: { option: "take_out" } })).toEqual({
      recipe: "startOrder",
      vars: { dineOption: "🛍 가져갈게요" },
    });
    expect(changeVars(kiosk, { type: "removeFromCart", args: { lineId: "a1" }, lineIndex: 3 })).toEqual({
      recipe: "removeLine",
      vars: { lineIndex: 3 },
    });
  });

  it("refuses anything not in the catalog before a click", () => {
    const add = (args: object) => () => changeVars(kiosk, { type: "addToCart", args: args as never });
    expect(add({ itemId: "hawaiian" })).toThrow(BridgeError);
    expect(add({ itemId: "constructor" })).toThrow(BridgeError);
    expect(add({ itemId: "cola", selections: { size: ["large"] } })).toThrow(BridgeError);
    expect(add({ itemId: "cola", selections: { volume: ["large"] } })).toThrow(BridgeError);
    expect(add({ itemId: "cola", qty: 11, selections: { volume: ["ml_500"] } })).toThrow(BridgeError);
    expect(() => changeVars(kiosk, { type: "removeFromCart", args: { lineId: "a1" }, lineIndex: -1 })).toThrow(BridgeError);
  });

  it("refuses a direct kiosk", () => {
    expect(() => changeVars(getKiosk("malo"), { type: "setDineOption", args: { option: "eat_in" } })).toThrow(BridgeError);
  });
});

describe("expectedLines", () => {
  it("is the session cart plus the added line, priced from menu data", () => {
    expect(
      expectedLines(kiosk, [pepperoniLine], { type: "addToCart", args: { itemId: "cola", selections: { volume: ["l_1_25"] } } }),
    ).toEqual([
      { name: "페퍼로니", options: ["라지", "씬", "베이컨", "올리브"], qty: 1, price: 24200 },
      { name: "콜라", options: ["1.25L"], qty: 1, price: 3300 },
    ]);
  });

  it("drops the removed line and keeps the cart for a dine option", () => {
    const cola: CartLine = { lineId: "b2", itemId: "cola", variant: "single", qty: 2, selections: { volume: ["ml_500"] }, unitPrice: 2000 };
    expect(expectedLines(kiosk, [pepperoniLine, cola], { type: "removeFromCart", args: { lineId: "a1" }, lineIndex: 0 })).toEqual([
      { name: "콜라", options: ["500ml"], qty: 2, price: 4000 },
    ]);
    expect(expectedLines(kiosk, [cola], { type: "setDineOption", args: { option: "eat_in" } })).toEqual([
      { name: "콜라", options: ["500ml"], qty: 2, price: 4000 },
    ]);
  });
});
