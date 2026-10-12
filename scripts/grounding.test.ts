import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import { checkGrounding } from "./grounding";

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
});
