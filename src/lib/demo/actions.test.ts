import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import type { AgentAction } from "@/lib/agent/actions";
import { actionRow } from "./actions";

const malo = getKiosk("malo");
const act = (tool: string, args: Record<string, unknown>, code: AgentAction["code"] = "ok", ms = 180): AgentAction => ({ tool, args, code, ms });

describe("actionRow", () => {
  it("addToCart: quantity, title and options from menu data", () => {
    const a = act("addToCart", { itemId: "cheese_burger", variant: "set", qty: 2, selections: { drink: ["zero_cola"], ingredients: ["no_pickles"] } });
    expect(actionRow(malo, a, "en")).toEqual({ text: "Added 2 × Cheeseburger set (Zero cola · No pickles)", tech: "addToCart ✓ 180 ms" });
    expect(actionRow(malo, a, "ko").text).toBe("치즈버거 세트 (제로콜라 · 피클 빼기) 2개를 담았어요");
    expect(actionRow(malo, act("addToCart", { itemId: "cola" }), "en").text).toBe("Added 1 × Cola");
  });

  it("a refusal says what was tried and why, with the code in the technical line", () => {
    const need = act("addToCart", { itemId: "cheese_burger", variant: "set" }, "NEEDS_CHOICE");
    expect(actionRow(malo, need, "en")).toEqual({ text: "Tried to add Cheeseburger set → a choice is needed first", tech: "addToCart refused (NEEDS_CHOICE)" });
    const pay = act("confirmCheckout", {}, "CONFLICT");
    expect(actionRow(malo, pay, "en")).toEqual({ text: "Tried to pay → the confirm card is required", tech: "confirmCheckout refused (CONFLICT)" });
    expect(actionRow(malo, pay, "ko").text).toBe("결제하려고 했어요 → 확인 카드가 필요해요");
    expect(actionRow(malo, act("addToCart", { itemId: "shrimp_burger" }, "SOLD_OUT"), "en").text).toMatch(/→ sold out$/);
  });

  it("every tool has its own words", () => {
    const rows = [
      act("setDineOption", { option: "eat_in" }),
      act("updateCart", { lineId: "a1b2c3d4e5f60718", itemId: "cheese_burger", changes: { selections: { side: ["fries_l"] } } }),
      act("removeFromCart", { lineId: "a1b2c3d4e5f60718", itemId: "cola" }),
      act("undoLastChange", {}),
      act("offerChoices", { templateId: "pick_option", choices: [{ kind: "option", id: "cola" }, { kind: "option", id: "cider" }] }),
      act("callStaff", { reasonCode: "unknown_info" }),
      act("requestCheckout", {}),
      act("confirmCheckout", {}),
      act("unknown", {}, "BAD_REQUEST"),
    ].map((a) => actionRow(malo, a, "en").text);
    expect(rows).toEqual([
      "Chose Eat here",
      "Changed Cheeseburger: Fries (L)",
      "Removed Cola",
      "Undid the last change",
      "Asked which one: Cola, Cider",
      "Called staff",
      "Opened the confirm card",
      "You confirmed by saying yes",
      "Tried something this kiosk does not have → the server refused it",
    ]);
  });

  it("a confirm is always the user's own: a tap on the card or a new yes, never the AI alone", () => {
    expect(actionRow(malo, act("confirmCheckout", {}, "ok", 120), "en")).toEqual({
      text: "You confirmed by saying yes",
      tech: "confirmCheckout ✓ 120 ms · needs your tap or a new 'yes'",
    });
    expect(actionRow(malo, { ...act("confirmCheckout", {}, "ok", 90), tap: true }, "en")).toEqual({
      text: "You tapped Yes, pay now",
      tech: "confirmCheckout ✓ 90 ms · needs your tap or a new 'yes'",
    });
    expect(actionRow(malo, { ...act("confirmCheckout", {}), tap: true }, "ko").text).toBe("'네, 결제할게요'를 눌러 확인했어요");
  });

  it("a learned kiosk's pending add says the kiosk is entering it", () => {
    const pizza = getKiosk("doughhouse");
    const itemId = pizza.items[0].itemId;
    const row = actionRow(pizza, { ...act("addToCart", { itemId }, "ok", 40), pending: true }, "en");
    expect(row.text).toBe(`Sent to the kiosk: 1 × ${pizza.items[0].name.en}`);
    expect(row.tech).toBe("addToCart ✓ 40 ms · kiosk entering it");
  });

  it("ids that are not in the data get neutral words, never the id", () => {
    const row = actionRow(malo, act("addToCart", { itemId: "made_up_item" }, "BAD_REQUEST"), "en");
    expect(row.text).toBe("Tried to add an item → the server refused it");
  });
});
