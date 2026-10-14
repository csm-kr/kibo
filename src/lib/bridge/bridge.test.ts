import { describe, expect, it, vi } from "vitest";
import doughhouseRaw from "../../../skills/doughhouse.json";
import { getKiosk } from "@/lib/adapters/catalog";
import { learnedToKiosk, skillSchema } from "@/lib/adapters/learned";
import type { CartLine, PendingBridgeCommand, Session } from "@/types/session";
import { BridgeError, changeVars, createBridge, expectedLines } from "./bridge";

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

  it("a pending item that is not in the skill never reaches a click, and is reported as failed", async () => {
    // A page with the home-screen tile and the category the recipe would tap first.
    const el = (text: string) => ({
      tagName: "BUTTON",
      onclick: null,
      parentElement: null,
      innerText: text,
      getAttribute: () => null,
      getBoundingClientRect: () => ({ width: 100, height: 100 }),
      click: vi.fn(),
    });
    const els = [el("화면을 터치하여 주문을 시작하세요"), el("피자")];
    const doc = {
      defaultView: { getComputedStyle: () => ({ visibility: "visible", cursor: "pointer" }) },
      body: { innerText: "도우하우스", querySelectorAll: () => els },
      createTreeWalker: () => ({ nextNode: () => null }),
    } as unknown as Document;
    const send = vi.fn().mockResolvedValue({});
    const bridge = createBridge({ doc, kiosk, sessionId: "s", kioskToken: "k", send });
    const pending = { commandId: "c1", type: "addToCart", args: { itemId: "hawaiian" }, source: "voice", at: 0 } as PendingBridgeCommand;
    const out = await bridge.handle(pending, { cart: [], dineOption: null } as unknown as Session);
    expect(out).toMatchObject({ commandId: "c1", ok: false });
    for (const e of els) expect(e.click).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "bridgeReport", args: expect.objectContaining({ ok: false }) }));
  });

  it("hands each real click to onTap, numbered, and returns the taps, the kiosk total and a replay time without the pause (14-final:3)", async () => {
    const el = (text: string, y: number) => ({
      tagName: "BUTTON",
      onclick: null,
      parentElement: null,
      innerText: text,
      getAttribute: () => null,
      getBoundingClientRect: () => ({ x: 100, y, width: 300, height: 120 }),
      click: vi.fn(),
    });
    const els = [el("화면을 터치하여 주문을 시작하세요", 900), el("🛍 가져갈게요", 600)];
    const doc = {
      defaultView: {
        getComputedStyle: () => ({ visibility: "visible", cursor: "pointer" }),
        requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
        MutationObserver: class {
          observe() {}
          disconnect() {}
        },
      },
      documentElement: {},
      body: { innerText: "장바구니 0개 · 합계 0원", querySelectorAll: () => els },
      querySelectorAll: () => [],
      createTreeWalker: () => ({ nextNode: () => null }),
    } as unknown as Document;
    const seen: { commandId: string; n: number; label: string; y: number }[] = [];
    const PAUSE = 150;
    const onTap = vi.fn(async (commandId: string, t: { n: number; label: string; y: number }) => {
      seen.push({ commandId, n: t.n, label: t.label, y: t.y });
      await new Promise((r) => setTimeout(r, PAUSE));
    });
    const send = vi.fn().mockResolvedValue({});
    const bridge = createBridge({ doc, kiosk, sessionId: "s", kioskToken: "k", send, onTap });
    const pending = { commandId: "c1", type: "setDineOption", args: { option: "take_out" }, source: "voice", at: 0 } as PendingBridgeCommand;
    const out = await bridge.handle(pending, { cart: [], dineOption: null } as unknown as Session);

    expect(seen).toEqual([
      { commandId: "c1", n: 1, label: "화면을 터치하여 주문을 시작하세요", y: 900 },
      { commandId: "c1", n: 2, label: "🛍 가져갈게요", y: 600 },
    ]);
    expect(out).toMatchObject({ commandId: "c1", ok: true, reported: true, kioskTotal: 0, cartBefore: [] });
    expect(out?.change).toBe(pending);
    expect(out?.taps.map((t) => [t.n, t.label, t.x, t.w])).toEqual([
      [1, "화면을 터치하여 주문을 시작하세요", 100, 300],
      [2, "🛍 가져갈게요", 100, 300],
    ]);
    // Two pauses of 150 ms happened, but the replay time is the bridge's own work only.
    expect(out!.ms).toBeLessThan(2 * PAUSE);
  });

  it("a report that fails to send is marked not reported", async () => {
    const doc = {
      defaultView: { getComputedStyle: () => ({ visibility: "visible", cursor: "pointer" }) },
      body: { innerText: "", querySelectorAll: () => [] },
      createTreeWalker: () => ({ nextNode: () => null }),
    } as unknown as Document;
    const send = vi.fn().mockRejectedValue(new Error("offline"));
    const bridge = createBridge({ doc, kiosk, sessionId: "s", kioskToken: "k", send });
    const pending = { commandId: "c9", type: "addToCart", args: { itemId: "hawaiian" }, source: "voice", at: 0 } as PendingBridgeCommand;
    const out = await bridge.handle(pending, { cart: [], dineOption: null } as unknown as Session);
    expect(out).toMatchObject({ ok: false, reported: false, taps: [] });
  });

  it("gives a chooseOptions recipe the chosen labels per group with the group's select and after steps", () => {
    const raw = structuredClone(doughhouseRaw) as unknown as {
      recipes: Record<string, unknown[]>;
      catalog: { itemId: string; optionGroups: { groupId: string }[] }[];
    };
    raw.recipes.addToCart = [{ op: "click", label: "{item}" }, { op: "chooseOptions", steps: [{ op: "click", label: "{option}" }] }];
    // One group id means the same steps on every item.
    for (const g of raw.catalog.flatMap((i) => i.optionGroups)) {
      if (g.groupId === "size") Object.assign(g, { after: [{ op: "click", label: "다음" }] });
      if (g.groupId === "toppings") Object.assign(g, { select: [{ op: "click", label: "+", within: "{option}" }] });
    }
    const chooser = learnedToKiosk(skillSchema.parse(raw));
    expect(
      changeVars(chooser, { type: "addToCart", args: { itemId: "pepperoni", selections: { toppings: ["olive"], size: ["large"] } } }).vars.groups,
    ).toEqual([
      { options: ["라지"], after: [{ op: "click", label: "다음" }] },
      { options: [] },
      { options: ["올리브"], select: [{ op: "click", label: "+", within: "{option}" }] },
    ]);
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
