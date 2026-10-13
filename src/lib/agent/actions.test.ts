import { describe, expect, it } from "vitest";
import type { CartLine } from "@/types/session";
import { agentAction } from "./actions";

const LINE: CartLine = { lineId: "a1b2c3d4e5f60718", itemId: "cheese_burger", variant: "set", qty: 1, selections: {}, unitPrice: 7200 };
const OK = { ok: true as const, response: {} };

describe("agentAction", () => {
  it("keeps the mapped ids, numbers and the code; ms is rounded", () => {
    const a = agentAction(
      "addToCart",
      { itemId: "cheese_burger", variant: "set", qty: 2, options: [{ groupId: "drink", optionIds: ["zero_cola"] }] },
      OK,
      180.4,
      [],
    );
    expect(a).toEqual({
      tool: "addToCart",
      args: { itemId: "cheese_burger", variant: "set", qty: 2, selections: { drink: ["zero_cola"] } },
      code: "ok",
      ms: 180,
    });
  });

  it("drops strings and keys that are not ids, so no free text gets through", () => {
    const a = agentAction(
      "addToCart",
      { itemId: "a burger please, no pickles", qty: 1, options: [{ groupId: "drink choice", optionIds: ["cola", "the red one"] }] },
      { ok: false, error: { code: "BAD_REQUEST", message: "x" } },
      5,
      [],
    );
    expect(a.args).toEqual({ qty: 1 });
    expect(JSON.stringify(a)).not.toMatch(/please|red one|drink choice|"x"/);
  });

  it("NEEDS_CHOICE and CONFLICT keep their code; the message never travels", () => {
    const need = agentAction("addToCart", { itemId: "cheese_burger", variant: "set" }, { ok: false, error: { code: "NEEDS_CHOICE", message: "Choose a drink." } }, 3, []);
    expect(need).toEqual({ tool: "addToCart", args: { itemId: "cheese_burger", variant: "set" }, code: "NEEDS_CHOICE", ms: 3 });
    const pay = agentAction("confirmCheckout", {}, { ok: false, error: { code: "CONFLICT", message: "Please confirm on the card." } }, 2, []);
    expect(pay).toEqual({ tool: "confirmCheckout", args: {}, code: "CONFLICT", ms: 2 });
  });

  it("a made-up tool name is 'unknown' with no args", () => {
    const a = agentAction("payNowPlease", { amount: 1 }, { ok: false, error: { code: "BAD_REQUEST", message: "x" } }, 1, []);
    expect(a).toEqual({ tool: "unknown", args: {}, code: "BAD_REQUEST", ms: 1 });
  });

  it("line tools carry the line's itemId from the cart before the call", () => {
    expect(agentAction("removeFromCart", { lineId: LINE.lineId }, OK, 1, [LINE]).args).toEqual({ lineId: LINE.lineId, itemId: "cheese_burger" });
    const upd = agentAction("updateCart", { lineId: LINE.lineId, options: [{ groupId: "side", optionIds: ["fries_l"] }] }, OK, 1, [LINE]);
    expect(upd.args).toEqual({ lineId: LINE.lineId, changes: { selections: { side: ["fries_l"] } }, itemId: "cheese_burger" });
    expect(agentAction("removeFromCart", { lineId: "ffffffffffffffff" }, OK, 1, [LINE]).args).toEqual({ lineId: "ffffffffffffffff" });
  });

  it("a learned kiosk's pending add is marked", () => {
    const pending = { ok: true as const, response: { pending: true as const } };
    expect(agentAction("addToCart", { itemId: "pepperoni" }, pending, 4, [])).toMatchObject({ code: "ok", pending: true });
  });
});
