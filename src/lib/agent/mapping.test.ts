import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import { CommandError } from "@/lib/commands/errors";
import { parseCommand } from "@/lib/commands/schemas";
import type { CommandResponse } from "@/lib/session/service";
import { toolCallToCommand, toolResult } from "./mapping";

const k = getKiosk("malo");
const SESSION = "S".repeat(22);

/** The mapped command must pass the server's own schema. */
function envelope(cmd: { type: string; args: object }) {
  return parseCommand({ sessionId: SESSION, commandId: "live:1", source: "voice", ...cmd });
}

describe("toolCallToCommand", () => {
  it("maps the hero addToCart, with options from two groups, to a selections record", () => {
    const cmd = toolCallToCommand("addToCart", {
      itemId: "cheese_burger",
      variant: "set",
      qty: 1,
      options: [
        { groupId: "drink", optionIds: ["zero_cola"] },
        { groupId: "ingredients", optionIds: ["no_pickles"] },
      ],
    });
    expect(cmd).toEqual({
      type: "addToCart",
      args: {
        itemId: "cheese_burger",
        variant: "set",
        qty: 1,
        selections: { drink: ["zero_cola"], ingredients: ["no_pickles"] },
      },
    });
    expect(envelope(cmd).type).toBe("addToCart");
  });

  it("leaves out what the model did not send", () => {
    expect(toolCallToCommand("addToCart", { itemId: "cola" })).toEqual({ type: "addToCart", args: { itemId: "cola" } });
    expect(toolCallToCommand("addToCart", { itemId: "cola", options: [] }).args).toEqual({ itemId: "cola" });
  });

  it("merges two entries for the same group", () => {
    const cmd = toolCallToCommand("addToCart", {
      itemId: "cheese_burger",
      options: [
        { groupId: "ingredients", optionIds: ["no_pickles"] },
        { groupId: "ingredients", optionIds: ["no_onion"] },
      ],
    });
    expect(cmd.args).toMatchObject({ selections: { ingredients: ["no_pickles", "no_onion"] } });
  });

  it("puts updateCart fields under changes", () => {
    const cmd = toolCallToCommand("updateCart", { lineId: "a1b2", options: [{ groupId: "side", optionIds: ["fries_l"] }] });
    expect(cmd).toEqual({ type: "updateCart", args: { lineId: "a1b2", changes: { selections: { side: ["fries_l"] } } } });
    expect(envelope(cmd).type).toBe("updateCart");
    expect(toolCallToCommand("updateCart", { lineId: "a1b2", qty: 2, variant: "single" }).args).toEqual({
      lineId: "a1b2",
      changes: { qty: 2, variant: "single" },
    });
  });

  it("maps the other tools", () => {
    expect(toolCallToCommand("setDineOption", { option: "take_out" })).toEqual({
      type: "setDineOption",
      args: { option: "take_out" },
    });
    expect(toolCallToCommand("removeFromCart", { lineId: "a1" })).toEqual({ type: "removeFromCart", args: { lineId: "a1" } });
    expect(toolCallToCommand("callStaff", { reasonCode: "unknown_info" })).toEqual({
      type: "callStaff",
      args: { reasonCode: "unknown_info" },
    });
    const offer = toolCallToCommand("offerChoices", {
      templateId: "pick_variant",
      choices: [{ kind: "variant", id: "largeSet" }],
    });
    expect(offer).toEqual({ type: "offerChoices", args: { templateId: "pick_variant", choices: [{ kind: "variant", id: "largeSet" }] } });
    expect(envelope(offer).type).toBe("offerChoices");
    for (const name of ["undoLastChange", "requestCheckout", "confirmCheckout"] as const) {
      expect(toolCallToCommand(name, undefined)).toEqual({ type: name, args: {} });
      expect(toolCallToCommand(name, {})).toEqual({ type: name, args: {} });
    }
  });

  it("rejects an unknown tool and malformed arguments with BAD_REQUEST", () => {
    for (const [name, args] of [
      ["payNow", {}],
      ["toString", {}],
      ["cardAction", {}],
      ["addToCart", { qty: 1 }],
      ["addToCart", { itemId: "cola", options: "zero" }],
      ["removeFromCart", "a1"],
    ] as const) {
      let err: unknown;
      try {
        toolCallToCommand(name, args);
      } catch (e) {
        err = e;
      }
      expect(err, name).toBeInstanceOf(CommandError);
      expect((err as CommandError).code).toBe("BAD_REQUEST");
    }
  });
});

describe("toolResult", () => {
  const response: CommandResponse = {
    ok: true,
    status: "ordering",
    cart: [
      {
        lineId: "f00d",
        itemId: "cheese_burger",
        variant: "set",
        qty: 2,
        selections: { side: ["fries_m"], drink: ["zero_cola"], ingredients: ["no_pickles"] },
        unitPrice: 7900,
      },
    ],
    total: 15800,
    cartVersion: 3,
    result: { lineId: "f00d", upsell: { offerItemIds: ["soft_cone", "apple_pie"] }, claimToken: "SECRET_CLAIM_TOKEN" },
  };

  it("names lines and upsell items in the requested locale", () => {
    expect(toolResult(k, "en", { ok: true, response })).toEqual({
      ok: true,
      status: "ordering",
      total: 15800,
      cart: [
        {
          lineId: "f00d",
          name: "Cheeseburger",
          variant: "set",
          options: ["Fries (M)", "Zero cola", "No pickles"],
          qty: 2,
          unitPrice: 7900,
        },
      ],
      upsell: [
        { itemId: "soft_cone", name: k.items.find((i) => i.itemId === "soft_cone")!.name.en },
        { itemId: "apple_pie", name: k.items.find((i) => i.itemId === "apple_pie")!.name.en },
      ],
    });
    const ko = toolResult(k, "ko", { ok: true, response }) as { cart: { name: string; options: string[] }[] };
    expect(ko.cart[0].name).toBe("치즈버거");
    expect(ko.cart[0].options).toEqual(["감자튀김 M", "제로콜라", "피클 빼기"]);
  });

  it("never passes on tokens, session ids or the cart version", () => {
    const json = JSON.stringify(toolResult(k, "en", { ok: true, response: { ...response, duplicate: true } }));
    expect(json).not.toContain("SECRET_CLAIM_TOKEN");
    expect(json).not.toContain("claimToken");
    expect(json).not.toContain(SESSION);
    expect(json).not.toContain("cartVersion");
  });

  it("leaves upsell out when there is none", () => {
    expect(toolResult(k, "en", { ok: true, response: { ...response, result: {} } })).not.toHaveProperty("upsell");
    expect(toolResult(k, "en", { ok: true, response: { ...response, result: {} } })).not.toHaveProperty("pending");
  });

  it("tells the model to wait while a learned kiosk replays the change", () => {
    const pending: CommandResponse = { ok: true, pending: true, status: "ordering", cart: [], total: 0, cartVersion: 0, result: { pending: true } };
    expect(toolResult(k, "en", { ok: true, response: pending })).toEqual({
      ok: true,
      pending: true,
      message: "The kiosk is doing it now; say you are adding it and wait.",
      status: "ordering",
      total: 0,
      cart: [],
    });
  });

  it("lists the drink choices with names for NEEDS_CHOICE", () => {
    const out = toolResult(k, "en", {
      ok: false,
      error: {
        code: "NEEDS_CHOICE",
        message: "Please choose a drink.",
        detail: {
          templateId: "pick_option",
          itemId: "cheese_burger",
          groupId: "drink",
          choices: [
            { kind: "option", id: "cola" },
            { kind: "option", id: "zero_cola" },
            { kind: "option", id: "cider" },
            { kind: "option", id: "iced_coffee" },
          ],
        },
      },
    });
    expect(out).toEqual({
      ok: false,
      code: "NEEDS_CHOICE",
      message: "Please choose a drink.",
      templateId: "pick_option",
      choices: [
        { kind: "option", id: "cola", name: "Cola" },
        { kind: "option", id: "zero_cola", name: "Zero cola" },
        { kind: "option", id: "cider", name: "Cider" },
        { kind: "option", id: "iced_coffee", name: "Iced coffee" },
      ],
    });
  });

  it("keeps a plain error small", () => {
    expect(toolResult(k, "ko", { ok: false, error: { code: "CONFLICT", message: "Please confirm on the card." } })).toEqual({
      ok: false,
      code: "CONFLICT",
      message: "Please confirm on the card.",
    });
  });
});
