import { describe, expect, it } from "vitest";
import { allKioskIds } from "@/lib/adapters/catalog";
import { examplesFor } from "./examples";

describe("examplesFor", () => {
  it("has examples for every kiosk in Korean and English, on the phone and on /demo", () => {
    for (const id of allKioskIds()) {
      for (const surface of ["phone", "demo"] as const) {
        const ko = examplesFor(id, "ko", surface);
        const en = examplesFor(id, "en", surface);
        expect(ko.length, `${id} ${surface}`).toBeGreaterThanOrEqual(4);
        expect(en.length, `${id} ${surface}`).toBe(ko.length);
        for (const s of ko) expect(s).toMatch(/[가-힣]/);
        for (const s of en) expect(s).not.toMatch(/[가-힣]/);
      }
    }
  });

  it("keeps MALO's phone list and the short first order on /demo", () => {
    expect(examplesFor("malo", "en")).toEqual([
      "Two cheeseburger sets, one without pickles. Drinks zero cola and cider.",
      "Make both fries large.",
      "Is this halal?",
      "I'll pay.",
    ]);
    expect(examplesFor("malo", "en", "demo")[0]).toBe("One cheeseburger set with zero cola");
    expect(examplesFor("malo", "ko", "demo")[0]).toBe("치즈버거 세트 하나, 음료는 제로콜라.");
  });

  it("pizza examples", () => {
    expect(examplesFor("doughhouse", "en")).toEqual([
      "A large pepperoni with thin dough and extra bacon",
      "Add a cola, 1.25 liters",
      "Remove the cola",
      "I'm done",
    ]);
  });

  it("bunsik shop examples (the learned 보리별 분식, I-405): names and options from skills/bunsik.json", () => {
    expect(examplesFor("bunsik", "en")).toEqual([
      "Cheese tteokbokki, medium spicy, with a boiled egg",
      "Add a tuna gimbap, sliced",
      "Remove the gimbap",
      "I'm done",
    ]);
    expect(examplesFor("bunsik", "ko")).toEqual([
      "치즈 떡볶이 3단계 보통맛으로, 삶은 계란 추가해 주세요.",
      "참치 김밥 하나 썰어서 추가해 주세요.",
      "김밥은 빼 주세요.",
      "다 골랐어요.",
    ]);
  });

  it("airport rail examples", () => {
    expect(examplesFor("airport_rail", "en")).toEqual([
      "Two adult tickets to City Center on the express, please.",
      "Add one child ticket too.",
      "Which platform is it?",
      "I'll pay.",
    ]);
    expect(examplesFor("airport_rail", "ko")).toEqual([
      "직통열차 시티센터, 어른 두 장 주세요.",
      "어린이 한 장도 추가해 주세요.",
      "몇 번 승강장이에요?",
      "결제할게요.",
    ]);
  });

  it("returns nothing for an unknown kiosk", () => {
    expect(examplesFor("nope", "en")).toEqual([]);
  });
});
