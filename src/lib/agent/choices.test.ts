import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import type { ChoiceRef, TemplateId } from "@/lib/commands/errors";
import { choiceLabel, choicePrice, choiceQuestion, declineLabel } from "./choices";

const k = getKiosk("malo");
const rail = getKiosk("airport_rail");

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
    expect(choiceLabel(rail, { kind: "staff", id: "staff" }, "en")).toBe("Call staff");
    expect(choiceLabel(rail, { kind: "staff", id: "staff" }, "ko")).toBe("직원 호출");
    expect(choicePrice(rail, { kind: "staff", id: "staff" }, "en")).toBeNull();
  });

  it("returns an empty label for ids that are not in the data", () => {
    expect(choiceLabel(k, { kind: "item", id: "halal_burger" }, "en")).toBe("");
    expect(choiceLabel(k, { kind: "option", id: "nope" }, "en")).toBe("");
    expect(choiceLabel(k, { kind: "variant", id: "huge" }, "en")).toBe("");
  });
});

describe("choiceQuestion", () => {
  const templates: TemplateId[] = ["pick_item", "pick_variant", "pick_option", "pick_dine", "yes_no", "alternatives", "upsell", "ask_staff"];
  const ask = (kiosk = k, templateId: TemplateId, choices: ChoiceRef[] = []) => ({
    ko: choiceQuestion(kiosk, { templateId, choices }, "ko"),
    en: choiceQuestion(kiosk, { templateId, choices }, "en"),
  });

  it("has a fixed question for every template in both languages", () => {
    for (const t of templates) {
      for (const kiosk of [k, rail]) {
        const q = ask(kiosk, t);
        expect(q.ko, t).toMatch(/\?$/);
        expect(q.en, t).toMatch(/\?$/);
      }
    }
    expect(ask(k, "pick_dine").en).toBe("Eat here or take out?");
    expect(ask(k, "upsell").ko).toBe("디저트도 함께 드릴까요?");
  });

  it("keeps MALO's questions, including for its own option groups", () => {
    expect(ask(k, "pick_item").ko).toBe("어떤 메뉴로 드릴까요?");
    expect(ask(k, "pick_option", [{ kind: "option", id: "cola" }]).en).toBe("Which one would you like?");
  });

  it("asks about tickets on a ticket machine, never about the menu", () => {
    expect(ask(rail, "pick_item")).toEqual({ ko: "어떤 승차권으로 드릴까요?", en: "Which ticket would you like?" });
    expect(ask(rail, "alternatives")).toEqual({ ko: "이 승차권은 어떠세요?", en: "How about one of these?" });
    for (const t of templates) expect(ask(rail, t).ko, t).not.toContain("메뉴");
  });

  it("names the passenger, seat and top-up groups", () => {
    expect(ask(rail, "pick_option", [{ kind: "option", id: "adult" }, { kind: "option", id: "child" }])).toEqual({
      ko: "어느 승객으로 드릴까요?",
      en: "Who is the ticket for?",
    });
    expect(ask(rail, "pick_option", [{ kind: "option", id: "window" }])).toEqual({
      ko: "어느 좌석으로 드릴까요?",
      en: "Window or aisle seat?",
    });
    expect(ask(rail, "pick_option", [{ kind: "option", id: "top_up_10000" }])).toEqual({
      ko: "얼마를 충전할까요?",
      en: "How much would you like to top up?",
    });
  });
});

describe("choicePrice", () => {
  it("gives an item the price its kiosk tile shows, in the kiosk's format", () => {
    expect(choicePrice(k, { kind: "item", id: "bulgogi_burger" }, "ko")).toBe("5,200원");
    expect(choicePrice(k, { kind: "item", id: "soft_cone" }, "en")).toBe("₩1,000");
  });

  it("gives an option only what it adds", () => {
    expect(choicePrice(k, { kind: "option", id: "extra_patty" }, "ko")).toBe("+1,500원");
    expect(choicePrice(k, { kind: "option", id: "fries_l" }, "en")).toBe("+₩500");
    expect(choicePrice(k, { kind: "option", id: "zero_cola" }, "en")).toBeNull();
    // A child fare is a discount on a ticket whose price the button does not know.
    expect(choicePrice(rail, { kind: "option", id: "child" }, "en")).toBeNull();
  });

  it("has no price for variants, dine options, yes/no or unknown ids", () => {
    expect(choicePrice(k, { kind: "variant", id: "set" }, "en")).toBeNull();
    expect(choicePrice(k, { kind: "dine", id: "eat_in" }, "en")).toBeNull();
    expect(choicePrice(k, { kind: "yesno", id: "no" }, "en")).toBeNull();
    expect(choicePrice(k, { kind: "item", id: "halal_burger" }, "en")).toBeNull();
  });
});

describe("declineLabel", () => {
  it("lets every upsell be declined with one tap", () => {
    expect(declineLabel("upsell", "ko")).toBe("괜찮아요");
    expect(declineLabel("upsell", "en")).toBe("No thanks");
  });

  it("an offer to call staff after an allergy question can be turned down too (16-judge-r3-fixes:1)", () => {
    expect(choiceQuestion(k, { templateId: "ask_staff", choices: [{ kind: "staff", id: "staff" }] }, "ko")).toBe("직원에게 확인해 드릴까요?");
    expect(choiceQuestion(k, { templateId: "ask_staff", choices: [{ kind: "staff", id: "staff" }] }, "en")).toBe("Shall I call staff to check for you?");
    expect(declineLabel("ask_staff", "ko")).toBe("괜찮아요");
    expect(declineLabel("ask_staff", "en", "ja")).toBe("いりません");
  });

  it("other questions need an answer, so they have none", () => {
    for (const t of ["pick_item", "pick_variant", "pick_option", "pick_dine", "yes_no", "alternatives"] as const) {
      expect(declineLabel(t, "en")).toBeNull();
    }
  });
});

describe("the AI language on the phone (16-judge-r3-fixes:0)", () => {
  const drink = { templateId: "pick_option" as const, choices: [{ kind: "option" as const, id: "cola" }, { kind: "option" as const, id: "cider" }] };
  const upsell = { templateId: "upsell" as const, choices: [{ kind: "item" as const, id: "soft_cone" }] };

  it("questions and fixed labels follow an AI-only language; names stay from menu data", () => {
    expect(choiceQuestion(k, upsell, "en", "ja")).toBe("デザートもいかがですか？");
    expect(choiceQuestion(k, drink, "en", "ja")).toBe("どれにしますか？");
    expect(choiceQuestion(rail, { templateId: "pick_option", choices: [{ kind: "option", id: "adult" }] }, "en", "ja")).toBe("どなたの乗車券ですか？");
    expect(declineLabel("upsell", "en", "ja")).toBe("いりません");
    expect(choiceLabel(k, { kind: "variant", id: "set" }, "en", "ja")).toBe("セット");
    expect(choiceLabel(k, { kind: "staff", id: "staff" }, "en", "fr")).toBe("Appeler le personnel");
    expect(choiceLabel(k, { kind: "option", id: "cider" }, "en", "ja")).toBe("Cider");
  });

  it("Korean or English as the AI language keeps the screens' words", () => {
    expect(choiceQuestion(k, upsell, "en", "en")).toBe("Would you like a dessert too?");
    expect(choiceQuestion(k, upsell, "ko", "ko")).toBe("디저트도 함께 드릴까요?");
    expect(declineLabel("upsell", "en", "ko")).toBe("No thanks");
  });

  it("every fixed text has every AI language", () => {
    const templates: TemplateId[] = ["pick_item", "pick_variant", "pick_option", "pick_dine", "yes_no", "alternatives", "upsell", "ask_staff"];
    for (const language of ["ja", "zh", "es", "vi", "fr", "th", "id"] as const) {
      for (const t of templates) {
        expect(choiceQuestion(k, { templateId: t, choices: [] }, "en", language)).not.toBe(choiceQuestion(k, { templateId: t, choices: [] }, "en"));
      }
      for (const c of [{ kind: "variant", id: "single" }, { kind: "yesno", id: "yes" }, { kind: "staff", id: "staff" }] as ChoiceRef[]) {
        expect(choiceLabel(k, c, "en", language)).toBeTruthy();
      }
    }
  });
});
