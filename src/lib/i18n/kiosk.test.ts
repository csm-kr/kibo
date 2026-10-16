import { describe, expect, it } from "vitest";
import {
  aiSubtitle,
  backInSeconds,
  demoCounterText,
  KIOSK_TEXT,
  kt,
  languageName,
  receiptInSeconds,
  secondsLeftText,
  stepLabel,
  TICKET_TEXT,
  variantWord,
  type KioskTextKey,
} from "./kiosk";

const HANGUL = /[가-힣]/;
const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const KEYS = Object.keys(KIOSK_TEXT) as KioskTextKey[];
/** Food words a ticket machine never shows (dine question, set, dessert offer, kcal): English on a Japanese screen. */
const FOOD_ONLY: KioskTextKey[] = [
  "dineQuestion", "dineChip", "takeOutChip", "kcal", "stepVariant", "variantQuestion", "addToCart",
  "upsellTitle", "upsellAdd", "upsellNo", "dineLabel", "dineNotSet",
];
/** Printed the same in every language, as kiosks do. */
const SAME_EVERYWHERE: KioskTextKey[] = ["badgeBest", "badgeNew"];

describe("kiosk strings", () => {
  it("every string has a Korean and an English version, and the English has no Korean in it", () => {
    for (const [key, text] of Object.entries({ ...KIOSK_TEXT, ...TICKET_TEXT })) {
      expect(text.ko.trim(), key).not.toBe("");
      expect(text.en.trim(), key).not.toBe("");
      expect(HANGUL.test(text.en), key).toBe(false);
    }
  });

  it("ticket wording only overrides keys that exist", () => {
    for (const key of Object.keys(TICKET_TEXT)) expect(Object.hasOwn(KIOSK_TEXT, key), key).toBe(true);
  });

  it("a ticket machine never asks for a menu", () => {
    for (const key of Object.keys(KIOSK_TEXT) as (keyof typeof KIOSK_TEXT)[]) {
      expect(kt(key, "ko", "ticket"), key).not.toContain("메뉴");
      expect(kt(key, "en", "ticket").toLowerCase(), key).not.toContain("menu");
    }
  });

  it("a ticket machine never says order in Korean, and its receipt countdown names the reference number", () => {
    for (const key of Object.keys(KIOSK_TEXT) as (keyof typeof KIOSK_TEXT)[]) {
      expect(kt(key, "ko", "ticket"), key).not.toContain("주문");
    }
    expect(receiptInSeconds(10, "ko", "ticket")).toBe("10초 후 참조 번호로 넘어가요");
    expect(receiptInSeconds(10, "ko")).toBe("10초 후 주문 번호로 넘어가요");
    expect(receiptInSeconds(10, "en", "ticket")).toBe("Showing your number in 10 s");
  });

  it("food keeps the base wording; tickets use their own", () => {
    expect(kt("order", "ko")).toBe("주문하기");
    expect(kt("order", "ko", "food")).toBe("주문하기");
    expect(kt("order", "ko", "ticket")).toBe("구매하기");
    expect(kt("pickupHint", "ko", "ticket")).toBe("승차권을 받아 가세요");
    expect(kt("pickupHint", "en", "ticket")).toBe("Please take your tickets");
  });

  it("K8's receipt of what was paid is titled like the review: order details, or purchase details on a ticket machine (#1 item 20)", () => {
    expect(kt("paidList", "ko")).toBe("주문 내역");
    expect(kt("paidList", "en")).toBe("Your order");
    expect(kt("paidList", "ko", "ticket")).toBe("구매 내역");
    expect(kt("paidList", "en", "ticket")).toBe("Your tickets");
  });

  it("names each language in itself", () => {
    expect(languageName("ko")).toBe("한국어");
    expect(languageName("en")).toBe("English");
    expect(languageName("ja")).toBe("日本語");
  });
});

describe("the ticket machine's Japanese screen (日本語)", () => {
  it("has Japanese for every string a ticket machine shows, with no Korean in it", () => {
    for (const key of KEYS) {
      if (FOOD_ONLY.includes(key) || SAME_EVERYWHERE.includes(key)) continue;
      const ja = kt(key, "ja", "ticket");
      expect(ja, key).toMatch(JAPANESE);
      expect(HANGUL.test(ja), key).toBe(false);
      expect(ja, key).not.toBe(kt(key, "en", "ticket"));
    }
  });

  it("falls back to English for any other string", () => {
    for (const key of FOOD_ONLY) expect(kt(key, "ja", "ticket"), key).toBe(kt(key, "en", "ticket"));
    expect(kt("dineQuestion", "ja")).toBe("Eat here or take out?");
    // The food wording of a key the ticket machine overrides has no Japanese of its own.
    expect(kt("order", "ja", "food")).toBe("Order");
    for (const key of SAME_EVERYWHERE) expect(kt(key, "ja", "ticket"), key).toBe(kt(key, "en", "ticket"));
  });

  it("never says menu or order, like the Korean and English ticket screens (R-007)", () => {
    for (const key of KEYS) {
      expect(kt(key, "ja", "ticket"), key).not.toContain("メニュー");
      expect(kt(key, "ja", "ticket"), key).not.toContain("注文");
    }
  });

  it("uses a real ticket machine's words: tickets, payment, card, receipt, reference number", () => {
    expect(kt("touchTitle", "ja", "ticket")).toBe("画面をタッチして購入");
    expect(kt("order", "ja", "ticket")).toBe("購入する");
    expect(kt("cartEmpty", "ja", "ticket")).toBe("乗車券を選んでください");
    expect(kt("quantity", "ja", "ticket")).toBe("枚数");
    expect(kt("reviewTitle", "ja", "ticket")).toBe("購入内容をご確認ください");
    expect(kt("pay", "ja", "ticket")).toBe("お支払い");
    expect(kt("payCard", "ja", "ticket")).toBe("カード");
    expect(kt("insertCard", "ja", "ticket")).toBe("カードを下の挿入口に入れてください");
    expect(kt("insertCardButton", "ja", "ticket")).toBe("カードを入れる");
    expect(kt("receiptQuestion", "ja", "ticket")).toBe("領収書を発行しますか？");
    expect(kt("orderNumber", "ja", "ticket")).toBe("受付番号");
    expect(kt("pickupHint", "ja", "ticket")).toBe("乗車券をお取りください");
    expect(kt("paidList", "ja", "ticket")).toBe("購入内容");
  });

  it("says the time and count lines in Japanese", () => {
    expect(stepLabel({ index: 1, count: 2, label: "お客さま" }, "ja")).toBe("ステップ 1/2 · お客さま");
    expect(backInSeconds(10, "ja")).toBe("10秒後に最初の画面に戻ります");
    expect(receiptInSeconds(10, "ja", "ticket")).toBe("10秒後に受付番号を表示します");
    expect(demoCounterText(12, 34, "ja")).toBe("タッチ 12回 · 34秒");
    expect(secondsLeftText(45, "ja")).toBe("残り45秒");
  });

  it("keeps the Korean and English time lines as they were", () => {
    expect(stepLabel({ index: 2, count: 4, label: "사이드" }, "ko")).toBe("2/4 단계 · 사이드");
    expect(stepLabel({ index: 2, count: 4, label: "Side" }, "en")).toBe("Step 2 of 4 · Side");
    expect(backInSeconds(10, "ko")).toBe("10초 후 처음 화면으로 돌아가요");
    expect(backInSeconds(10, "en")).toBe("Back to the start in 10 s");
    expect(demoCounterText(12, 34, "en")).toBe("12 taps · 34 s");
    expect(secondsLeftText(45, "ko")).toBe("45초 남았어요");
  });

  it("names a variant in English on a Japanese screen (a ticket has one variant, so no line shows it)", () => {
    expect(variantWord("set", "ja")).toBe("set");
    expect(variantWord("set", "ko")).toBe("세트");
  });
});

describe("aiSubtitle", () => {
  it("is KIBO's English line under the kiosk's Korean AI banner", () => {
    expect(aiSubtitle("add", "food", "Cheeseburger set · Fries (M) · Zero cola · No pickles")).toBe(
      "AI added: Cheeseburger set · Fries (M) · Zero cola · No pickles",
    );
    expect(aiSubtitle("update", "food", "Cheeseburger set")).toBe("AI changed: Cheeseburger set");
    expect(aiSubtitle("remove", "food", "Cola")).toBe("AI removed: Cola");
    expect(aiSubtitle("undo", "food", "")).toBe("AI undid the last change");
    expect(aiSubtitle("clear", "food", "")).toBe("AI cleared the cart");
  });

  it("a ticket machine says chose and tickets (R-007)", () => {
    expect(aiSubtitle("add", "ticket", "Express")).toBe("AI chose: Express");
    expect(aiSubtitle("clear", "ticket", "")).toBe("AI cleared the tickets");
  });
});
