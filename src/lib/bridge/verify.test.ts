import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import { parseKioskLine, readKioskLines, readKioskTotal, sameLines } from "./verify";

const learned = getKiosk("doughhouse").learned!;
const TOTAL = learned.cartTotalPattern;
const LINE = learned.cartLinePattern;

// What the Doughhouse page's body.innerText looks like on the menu with two lines in the cart.
const PAGE = [
  "피자\t사이드\t음료",
  "마르게리따",
  "15,900원",
  "장바구니 2개 · 합계 27,500원",
  "페퍼로니 (라지, 씬, 베이컨, 올리브) x1 24,200원 삭제",
  "콜라 (1.25L) x1 3,300원 삭제",
  "주문하기",
].join("\n");

const doc = (innerText: string) => ({ body: { innerText } }) as unknown as Document;

describe("readKioskTotal", () => {
  it("reads the kiosk's own total", () => {
    expect(readKioskTotal(doc(PAGE), TOTAL)).toBe(27500);
    expect(readKioskTotal(doc("장바구니 0개 · 합계 0원"), TOTAL)).toBe(0);
  });

  it("is null when the total is not on the screen", () => {
    expect(readKioskTotal(doc("도우하우스\n화면을 터치하여 주문을 시작하세요"), TOTAL)).toBeNull();
  });
});

describe("readKioskLines", () => {
  it("returns only the cart lines, without the delete button text", () => {
    expect(readKioskLines(doc(PAGE), LINE)).toEqual([
      "페퍼로니 (라지, 씬, 베이컨, 올리브) x1 24,200원",
      "콜라 (1.25L) x1 3,300원",
    ]);
  });

  it("is empty for an empty cart", () => {
    expect(readKioskLines(doc("장바구니 0개 · 합계 0원\n주문하기"), LINE)).toEqual([]);
  });
});

describe("parseKioskLine", () => {
  it("splits name, options, quantity and price", () => {
    expect(parseKioskLine("페퍼로니 (라지, 씬, 베이컨, 올리브) x1 24,200원", LINE)).toEqual({
      name: "페퍼로니",
      options: ["라지", "씬", "베이컨", "올리브"],
      qty: 1,
      price: 24200,
    });
    expect(parseKioskLine("갈릭디핑소스 x2 1,000원", LINE)).toEqual({ name: "갈릭디핑소스", options: [], qty: 2, price: 1000 });
  });

  it("is null for text that is not a cart line", () => {
    expect(parseKioskLine("장바구니 2개 · 합계 27,500원", LINE)).toBeNull();
  });
});

describe("a kiosk whose cart line is a block of text lines (보리별 분식, I-405)", () => {
  const bunsik = getKiosk("bunsik").learned!;
  const BLINE = bunsik.cartLinePattern;
  const SEP = bunsik.cartOptionSeparator;
  // The bk9 page's body.innerText on the menu (Chromium, 10-18), with four lines in the cart: no options and two of it,
  // options split by " / ", a count option ("×1"), and the set's wizard summary.
  const BPAGE = [
    "★", "보리별 분식", "매장 식사", "10.14 (수) 12:30", "처음으로", "오늘의 할인", "로제 떡볶이 6,500원 → 5,500원", "바로 주문 ›",
    "떡볶이", "김밥", "라면/우동", "튀김/순대", "세트", "음료", "🍱", "BEST", "보리별 세트", "9,900원", "🧺", "튀순 세트", "8,500원",
    "장바구니", "5", "전체 삭제",
    "군만두", "−", "2", "+", "7,000원", "✕",
    "보리별 떡볶이", "3단계 보통맛 / 삶은 계란", "−", "1", "+", "5,000원", "✕",
    "참치 김밥", "썰어서 / 김밥 추가 1줄 ×1", "−", "1", "+", "7,500원", "✕",
    "보리별 세트", "치즈 떡볶이(2단계 덜매운맛) · 참치 김밥(통으로) · 식혜", "−", "1", "+", "11,900원", "✕",
    "총 5개", "31,400원", "주문 확인하기", "장바구니에 담았어요.",
  ].join("\n");

  it("reads each cart line across its text lines, and nothing else", () => {
    const lines = readKioskLines(doc(BPAGE), BLINE);
    expect(lines).toHaveLength(4);
    expect(lines.map((l) => parseKioskLine(l, BLINE, SEP))).toEqual([
      { name: "군만두", options: [], qty: 2, price: 7000 },
      { name: "보리별 떡볶이", options: ["3단계 보통맛", "삶은 계란"], qty: 1, price: 5000 },
      { name: "참치 김밥", options: ["썰어서", "김밥 추가 1줄"], qty: 1, price: 7500 },
      { name: "보리별 세트", options: ["치즈 떡볶이", "2단계 덜매운맛", "참치 김밥", "통으로", "식혜"], qty: 1, price: 11900 },
    ]);
    expect(readKioskTotal(doc(BPAGE), bunsik.cartTotalPattern)).toBe(31400);
  });

  it("finds no line in an empty cart and still reads its total", () => {
    const empty = "보리별 분식\n장바구니\n0\n드시고 싶은 메뉴를 골라 주세요\n총 0개\n0원\n주문 확인하기";
    expect(readKioskLines(doc(empty), BLINE)).toEqual([]);
    expect(readKioskTotal(doc(empty), bunsik.cartTotalPattern)).toBe(0);
  });

  it("a count option shown more than once is not the one-roll option, so it never matches by accident", () => {
    const two = "전체 삭제\n참치 김밥\n썰어서 / 김밥 추가 1줄 ×2\n−\n1\n+\n10,500원\n✕";
    const [line] = readKioskLines(doc(two), BLINE);
    expect(parseKioskLine(line, BLINE, SEP)?.options).toEqual(["썰어서", "김밥 추가 1줄 ×2"]);
  });

  it("leaves one-line kiosks as they were: the separator defaults to a comma", () => {
    expect(learned.cartOptionSeparator).toBe(",");
    expect(parseKioskLine("페퍼로니 (라지, 씬) x1 21,900원", LINE)?.options).toEqual(["라지", "씬"]);
  });
});

describe("sameLines", () => {
  const pepperoni = { name: "페퍼로니", options: ["라지", "씬"], qty: 1, price: 21900 };

  it("ignores option order and line order", () => {
    const cola = { name: "콜라", options: ["500ml"], qty: 1, price: 2000 };
    expect(sameLines([pepperoni, cola], [cola, { ...pepperoni, options: ["씬", "라지"] }])).toBe(true);
  });

  it("treats two kiosk lines of the same thing as one session line with their quantity", () => {
    expect(sameLines([{ ...pepperoni, qty: 2, price: 43800 }], [pepperoni, pepperoni])).toBe(true);
  });

  it("finds a missing, extra or different line", () => {
    expect(sameLines([pepperoni], [])).toBe(false);
    expect(sameLines([], [pepperoni])).toBe(false);
    expect(sameLines([pepperoni], [{ ...pepperoni, options: ["라지", "오리지널"] }])).toBe(false);
    expect(sameLines([pepperoni], [{ ...pepperoni, price: 22900 }])).toBe(false);
  });
});
