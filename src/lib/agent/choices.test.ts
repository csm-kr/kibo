import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import type { TemplateId } from "@/lib/commands/errors";
import { choiceLabel, choiceQuestion } from "./choices";

const k = getKiosk("malo");

describe("choiceLabel", () => {
  it("names items and options from menu data", () => {
    expect(choiceLabel(k, { kind: "item", id: "cheese_burger" }, "ko")).toBe("치즈버거");
    expect(choiceLabel(k, { kind: "item", id: "cheese_burger" }, "en")).toBe("Cheeseburger");
    expect(choiceLabel(k, { kind: "option", id: "zero_cola" }, "ko")).toBe("제로콜라");
    expect(choiceLabel(k, { kind: "option", id: "zero_cola" }, "en")).toBe("Zero cola");
  });

  it("names variants, dine options and yes/no from fixed words", () => {
    expect(choiceLabel(k, { kind: "variant", id: "single" }, "ko")).toBe("단품");
    expect(choiceLabel(k, { kind: "variant", id: "largeSet" }, "ko")).toBe("라지 세트");
    expect(choiceLabel(k, { kind: "variant", id: "set" }, "en")).toBe("Set");
    expect(choiceLabel(k, { kind: "variant", id: "largeSet" }, "en")).toBe("Large set");
    expect(choiceLabel(k, { kind: "dine", id: "eat_in" }, "ko")).toBe("매장에서 먹기");
    expect(choiceLabel(k, { kind: "dine", id: "take_out" }, "en")).toBe("Take out");
    expect(choiceLabel(k, { kind: "yesno", id: "yes" }, "ko")).toBe("네");
    expect(choiceLabel(k, { kind: "yesno", id: "no" }, "en")).toBe("No");
  });

  it("returns an empty label for ids that are not in the data", () => {
    expect(choiceLabel(k, { kind: "item", id: "halal_burger" }, "en")).toBe("");
    expect(choiceLabel(k, { kind: "option", id: "nope" }, "en")).toBe("");
    expect(choiceLabel(k, { kind: "variant", id: "huge" }, "en")).toBe("");
  });
});

describe("choiceQuestion", () => {
  const templates: TemplateId[] = ["pick_item", "pick_variant", "pick_option", "pick_dine", "yes_no", "alternatives", "upsell"];

  it("has a fixed question for every template in both languages", () => {
    for (const t of templates) {
      expect(choiceQuestion(t, "ko"), t).toMatch(/\?$/);
      expect(choiceQuestion(t, "en"), t).toMatch(/\?$/);
    }
    expect(choiceQuestion("pick_dine", "en")).toBe("Eat here or take out?");
    expect(choiceQuestion("upsell", "ko")).toBe("디저트도 함께 드릴까요?");
  });
});
