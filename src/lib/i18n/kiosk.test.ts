import { describe, expect, it } from "vitest";
import { KIOSK_TEXT, kt, languageName, receiptInSeconds, TICKET_TEXT } from "./kiosk";

const HANGUL = /[가-힣]/;

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

  it("names each language in itself", () => {
    expect(languageName("ko")).toBe("한국어");
    expect(languageName("en")).toBe("English");
  });
});
