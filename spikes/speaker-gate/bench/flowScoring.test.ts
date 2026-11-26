import { describe, expect, it } from "vitest";
import { isRightFlow, turnActions } from "./flowScoring";

const turns = [
  { kind: "hero", text: "", startMs: 3000, endMs: 9000 },
  { kind: "fries", text: "", startMs: 21000, endMs: 23000 },
  { kind: "no", text: "", startMs: 35000, endMs: 36000 },
  { kind: "pay", text: "", startMs: 48000, endMs: 49500 },
];
const tool = (t: number, text: string) => ({ t, kind: "tool", text });

describe("flow scoring", () => {
  it("right = hero cart, review reached (confirming or paying), no bystander item", () => {
    expect(isRightFlow({ heroCart: true, status: "confirming", bystanderItems: [] })).toBe(true);
    expect(isRightFlow({ heroCart: true, status: "paying", bystanderItems: [] })).toBe(true);
    expect(isRightFlow({ heroCart: true, status: "ordering", bystanderItems: [] })).toBe(false);
    expect(isRightFlow({ heroCart: true, status: "confirming", bystanderItems: ["iced_tea"] })).toBe(false);
  });

  it("a turn counts as acted on only by its own action within 5 s of its end, not by any reply", () => {
    const events = [
      tool(10000, 'addToCart {"itemId":"cheese_burger"}'),
      { t: 23500, kind: "audio" }, // a spoken reply, but no updateCart: the fries turn was not acted on
      tool(50000, "requestCheckout {}"),
    ];
    const a = turnActions(turns, events);
    expect(a.acted).toEqual({ hero: true, fries: false, pay: true });
    expect(a.reactionMs).toEqual({ hero: 1000, fries: null, pay: 500 });
  });

  it("an addToCart of another item does not act on the hero turn", () => {
    const a = turnActions(turns, [tool(9500, 'addToCart {"itemId":"iced_tea"}')]);
    expect(a.acted.hero).toBe(false);
  });

  it("an action before the turn ended does not count", () => {
    const a = turnActions(turns, [tool(47000, "requestCheckout {}")]);
    expect(a.acted.pay).toBe(false);
  });
});
