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
