import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import { checkGrounding, internalWords, offersToPay, replyLanguage } from "./grounding";

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

describe("internalWords (14-final:1: replies never use the app's internal words)", () => {
  it("catches the words judges saw in replies", () => {
    expect(internalWords("Please check the confirm card.")).toEqual(["confirm card"]);
    expect(internalWords("주문 내역 확인 카드가 화면에 나왔습니다.")).toEqual(["확인 카드"]);
    expect(internalWords("I am adding a large pepperoni. Please wait a moment.")).toEqual(["I am adding"]);
    expect(internalWords("페퍼로니 라지를 담고 있어요.")).toEqual(["담는 중"]);
  });

  it("passes plain replies, the card the user pays with, and waiting for staff", () => {
    expect(internalWords("직원을 불렀어요. 잠시만 기다려 주세요.")).toEqual([]);
    expect(internalWords("I've called staff. Please wait a moment.")).toEqual([]);
    // A learned kiosk is still entering the change on its own page when the AI answers.
    expect(internalWords("키오스크에 담고 있어요.", { replaying: true })).toEqual([]);
    expect(internalWords("Please check the confirm card.", { replaying: true })).toEqual(["confirm card"]);
    expect(internalWords("Added two cheeseburger sets. Please check your order on the screen.")).toEqual([]);
    expect(internalWords("Insert your card into the kiosk to pay.")).toEqual([]);
    expect(internalWords("주문 내역을 확인해 주세요.")).toEqual([]);
  });
});

describe("replyLanguage (14-final:4, no AI)", () => {
  it("tells each picker language from a typical reply, with menu names left in English or Korean", () => {
    const cases: [string, string][] = [
      ["치즈버거 세트 두 개를 담았어요. 더 필요하신 게 있나요?", "ko"],
      ["I added two Cheeseburger sets. Anything else?", "en"],
      ["Cheeseburger setを2つ追加しました。ほかにご注文はありますか？", "ja"],
      ["已为您添加两份 Cheeseburger set。还需要别的吗？", "zh"],
      ["He añadido dos Cheeseburger set con Cola. ¿Quiere algo más?", "es"],
      ["Tôi đã thêm hai phần Cheeseburger set. Bạn có muốn gọi thêm gì không?", "vi"],
      ["J'ai ajouté deux Cheeseburger set avec un Cola. Voulez-vous autre chose ?", "fr"],
      ["เพิ่ม Cheeseburger set สองชุดแล้วค่ะ ต้องการอะไรเพิ่มไหมคะ", "th"],
      ["Saya sudah menambahkan dua Cheeseburger set. Apakah ada yang lain?", "id"],
      // A Live reply the first word list missed (evidence/live-languages.json, 10-14).
      ["Puedo responder preguntas, ayudarte a escribir textos o resolver dudas.", "es"],
      ["I can help answer questions and give information.", "en"],
    ];
    for (const [text, lang] of cases) expect([text, replyLanguage(text, k)]).toEqual([text, lang]);
  });

  it("does not count menu names: an English reply full of Korean names is still English", () => {
    expect(replyLanguage("Your 치즈버거 and 제로콜라 are added.", k)).toBe("en");
  });

  it("says null when it cannot tell", () => {
    expect(replyLanguage("Cheeseburger, 6,900.", k)).toBeNull();
    expect(replyLanguage("", k)).toBeNull();
  });
});
