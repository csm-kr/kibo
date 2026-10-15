import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import { toolDeclarations } from "./tools";

const k = getKiosk("malo");

type Schema = { type?: string; enum?: string[]; properties?: Record<string, Schema>; items?: Schema; required?: string[] };

const decls = toolDeclarations(k);
const byName = (name: string) => decls.find((d) => d.name === name)!;
const params = (name: string) => byName(name).parametersJsonSchema as Schema;

describe("toolDeclarations", () => {
  it("declares the 9 tools, each with a one-line description", () => {
    expect(decls.map((d) => d.name)).toEqual([
      "setDineOption",
      "addToCart",
      "updateCart",
      "removeFromCart",
      "undoLastChange",
      "offerChoices",
      "callStaff",
      "requestCheckout",
      "confirmCheckout",
    ]);
    for (const d of decls) {
      expect(d.description).toBeTruthy();
      expect(d.description).not.toContain("\n");
      expect(d.parameters).toBeUndefined();
      expect((d.parametersJsonSchema as Schema).type).toBe("object");
    }
  });

  it("builds addToCart enums from the catalog", () => {
    const p = params("addToCart");
    expect(p.required).toEqual(["itemId"]);
    expect(p.properties!.itemId.enum).toEqual(k.items.map((i) => i.itemId));
    expect(p.properties!.variant.enum).toEqual(["single", "set", "largeSet"]);
    const option = p.properties!.options.items!.properties!;
    const groupIds = new Set(k.items.flatMap((i) => i.optionGroups.map((g) => g.groupId)));
    const optionIds = new Set(k.items.flatMap((i) => i.optionGroups.flatMap((g) => g.options.map((o) => o.optionId))));
    expect(new Set(option.groupId.enum)).toEqual(groupIds);
    expect(option.groupId.enum).toHaveLength(groupIds.size);
    expect(new Set(option.optionIds.items!.enum)).toEqual(optionIds);
    expect(option.optionIds.items!.enum).toHaveLength(optionIds.size);
  });

  it("gives updateCart the same option shape and a required lineId", () => {
    const p = params("updateCart");
    expect(p.required).toEqual(["lineId"]);
    expect(p.properties!.options).toEqual(params("addToCart").properties!.options);
  });

  it("limits the fixed enums", () => {
    expect(params("setDineOption").properties!.option.enum).toEqual(["eat_in", "take_out"]);
    expect(params("callStaff").properties!.reasonCode.enum).toEqual(["unknown_info", "user_request", "stuck"]);
    const offer = params("offerChoices").properties!;
    expect(offer.templateId.enum).toEqual([
      "pick_item",
      "pick_variant",
      "pick_option",
      "pick_dine",
      "yes_no",
      "alternatives",
      "upsell",
      "ask_staff",
    ]);
    expect(offer.choices.items!.properties!.kind.enum).toEqual(["item", "variant", "option", "dine", "yesno", "staff"]);
  });

  it("gives the no-argument tools an empty object", () => {
    for (const name of ["undoLastChange", "requestCheckout", "confirmCheckout"]) {
      expect(params(name).properties).toEqual({});
    }
  });

  it("leaves setDineOption and dine choices out on a kiosk without dine options (8 tools)", () => {
    const rail = getKiosk("airport_rail");
    const ticket = toolDeclarations(rail);
    expect(ticket.map((d) => d.name)).toEqual([
      "addToCart",
      "updateCart",
      "removeFromCart",
      "undoLastChange",
      "offerChoices",
      "callStaff",
      "requestCheckout",
      "confirmCheckout",
    ]);
    const offer = (ticket.find((d) => d.name === "offerChoices")!.parametersJsonSchema as Schema).properties!;
    expect(offer.templateId.enum).not.toContain("pick_dine");
    expect(offer.choices.items!.properties!.kind.enum).not.toContain("dine");
    // Only the variants the catalog sells: every ticket is "single".
    const add = (ticket.find((d) => d.name === "addToCart")!.parametersJsonSchema as Schema).properties!;
    expect(add.variant.enum).toEqual(["single"]);
  });

  it("leaves updateCart and confirmCheckout out for a learned kiosk (7 tools)", () => {
    const dh = getKiosk("doughhouse");
    const learned = toolDeclarations(dh);
    expect(learned.map((d) => d.name)).toEqual([
      "setDineOption",
      "addToCart",
      "removeFromCart",
      "undoLastChange",
      "offerChoices",
      "callStaff",
      "requestCheckout",
    ]);
    const itemIds = (learned[1].parametersJsonSchema as Schema).properties!.itemId.enum;
    expect(itemIds).toEqual(dh.items.map((i) => i.itemId));
  });
});
