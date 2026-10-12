import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import { isForbiddenTarget, planSteps, RecipeError } from "./recipe";

const learned = getKiosk("doughhouse").learned!;
const forbidden = learned.forbiddenLabels;

describe("planSteps", () => {
  it("expands the learned addToCart recipe into plain steps", () => {
    const plan = planSteps(
      learned.recipes.addToCart,
      { category: "피자", item: "페퍼로니", options: ["라지", "씬"], qtyMinus1: 2 },
      forbidden,
    );
    expect(plan).toEqual([
      { op: "click", label: "피자" },
      { op: "click", label: "페퍼로니" },
      { op: "clickIfVisible", role: "radio", name: "라지" },
      { op: "clickIfVisible", role: "checkbox", name: "라지" },
      { op: "clickIfVisible", role: "radio", name: "씬" },
      { op: "clickIfVisible", role: "checkbox", name: "씬" },
      { op: "click", label: "+" },
      { op: "click", label: "+" },
      { op: "click", label: "장바구니 담기" },
      { op: "clickIfVisible", label: "아니요, 괜찮아요" },
    ]);
  });

  it("repeats zero times and skips an empty forEach", () => {
    const plan = planSteps(learned.recipes.addToCart, { category: "사이드", item: "갈릭디핑소스", options: [], qtyMinus1: 0 }, forbidden);
    expect(plan.map((s) => s.label ?? s.name)).toEqual(["사이드", "갈릭디핑소스", "장바구니 담기", "아니요, 괜찮아요"]);
  });

  it("turns a clickNth index placeholder into a number", () => {
    expect(planSteps(learned.recipes.removeLine, { lineIndex: 1 }, forbidden)).toEqual([
      { op: "clickNth", label: "삭제", index: 1 },
    ]);
  });

  it("refuses a missing placeholder value instead of clicking '{item}'", () => {
    expect(() => planSteps(learned.recipes.addToCart, { category: "피자", options: [], qtyMinus1: 0 }, forbidden)).toThrow(RecipeError);
  });

  it("refuses a bad repeat count or line index", () => {
    expect(() => planSteps([{ op: "repeat", times: "{n}", steps: [{ op: "click", label: "+" }] }], { n: -1 }, forbidden)).toThrow(RecipeError);
    expect(() => planSteps([{ op: "repeat", times: "{n}", steps: [{ op: "click", label: "+" }] }], { n: "abc" }, forbidden)).toThrow(RecipeError);
    expect(() => planSteps([{ op: "clickNth", label: "삭제", index: "{i}" }], { i: 1.5 }, forbidden)).toThrow(RecipeError);
  });

  it("refuses a forEach over something that is not a list", () => {
    expect(() =>
      planSteps([{ op: "forEach", over: "options", as: "option", steps: [{ op: "click", label: "{option}" }] }], { options: "라지" }, forbidden),
    ).toThrow(RecipeError);
  });

  it("refuses any step aimed at a forbidden label, also when a variable fills it in", () => {
    expect(() => planSteps([{ op: "click", label: "주문하기" }], {}, forbidden)).toThrow(RecipeError);
    expect(() => planSteps([{ op: "click", label: "{item}" }], { item: "💳 신용/체크카드" }, forbidden)).toThrow(RecipeError);
    expect(() => planSteps([{ op: "clickIfVisible", role: "button", name: "{x}" }], { x: "결제하기" }, forbidden)).toThrow(RecipeError);
    expect(() => planSteps([{ op: "click", text: "카드 결제" }], {}, forbidden)).toThrow(RecipeError);
  });
});

describe("isForbiddenTarget", () => {
  it("refuses an element whose label or text holds a forbidden word", () => {
    expect(isForbiddenTarget({ label: "주문하기", text: "주문하기" }, forbidden)).toBe(true);
    // A harmless label on an element that also shows a payment word is still refused.
    expect(isForbiddenTarget({ label: "다음", text: "다음\n카드 결제" }, forbidden)).toBe(true);
    expect(isForbiddenTarget({ label: "💳 신용/체크카드", text: "💳 신용/체크카드" }, forbidden)).toBe(true);
  });

  it("allows ordinary kiosk controls", () => {
    expect(isForbiddenTarget({ label: "화면을 터치하여 주문을 시작하세요", text: "화면을 터치하여 주문을 시작하세요" }, forbidden)).toBe(false);
    expect(isForbiddenTarget({ label: "페퍼로니", text: "페퍼로니\n17,900원" }, forbidden)).toBe(false);
    expect(isForbiddenTarget({ label: "삭제", text: "삭제" }, forbidden)).toBe(false);
  });
});
