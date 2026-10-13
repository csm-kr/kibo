import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import { checkGrounding, offersToPay } from "./grounding";

const k = getKiosk("malo");

describe("checkGrounding", () => {
  it("passes a reply that names a best item with the sanctioned wording", () => {
    const r = checkGrounding("The soft cone is marked as a best seller. It is 1,000 won.", k);
    expect(r).toEqual({ pass: true, matched: [], mentioned: ["soft_cone"] });
  });

  it("fails the I-072 reply: an invented temperature word and popularity for an item without the best badge", () => {
    const r = checkGrounding("Our warm Apple pie is very popular.", k);
    expect(r.pass).toBe(false);
    expect(r.matched).toEqual(["warm", "popular:apple_pie"]);
    expect(r.mentioned).toEqual(["apple_pie"]);
  });

  it("does not flag deny-list words inside menu names", () => {
    expect(checkGrounding("따뜻한 커피는 2,000원이에요.", k).pass).toBe(true);
    expect(checkGrounding("Hot coffee and a Crispy chicken burger.", k)).toMatchObject({
      pass: true,
      mentioned: ["crispy_chicken_burger", "hot_coffee"],
    });
  });

  it("matches the longest name, so a double cheeseburger is not also a cheeseburger", () => {
    expect(checkGrounding("A Double cheeseburger is popular.", k)).toMatchObject({
      pass: false,
      matched: ["popular:double_cheese_burger"],
      mentioned: ["double_cheese_burger"],
    });
  });

  it("checks Korean words and popularity per sentence", () => {
    expect(checkGrounding("인기 메뉴는 치즈버거와 소프트콘이에요. 애플파이도 있어요.", k).pass).toBe(true);
    expect(checkGrounding("애플파이가 제일 인기 많아요. 맛있어요!", k).matched).toEqual(["맛있", "popular:apple_pie"]);
  });

  it("flags food that is not on the menu", () => {
    expect(checkGrounding("Try a milkshake with your burger.", k).matched).toEqual(["off-menu:milkshake"]);
  });

  it("does not flag an off-menu word that the kiosk's own item names use", () => {
    expect(checkGrounding("Your pizza is on the kiosk.", getKiosk("doughhouse")).pass).toBe(true);
  });
});

describe("offersToPay (I-100: a learned kiosk's AI must not offer to pay)", () => {
  it("catches the I-100 reply and other offers, in English and Korean", () => {
    for (const reply of [
      "Would you like to pay now?",
      "Do you want to pay with a card?",
      "Shall I pay for you?",
      "I'll complete the payment.",
      "결제해 드릴까요?",
      "지금 결제하시겠어요?",
    ]) {
      expect(offersToPay(reply), reply).toBe(true);
    }
  });

  it("passes telling the user to pay on the kiosk", () => {
    expect(offersToPay("Please tap 주문하기 (Order) on the kiosk and pay there.")).toBe(false);
    expect(offersToPay("키오스크에서 주문하기를 누르고 결제해 주세요.")).toBe(false);
  });
});
