import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import { menuForModel } from "./menu";

const k = getKiosk("malo");

describe("menuForModel", () => {
  const menu = menuForModel(k);
  const cheese = menu.items.find((i) => i.itemId === "cheese_burger")!;

  it("lists every category and item", () => {
    expect(menu.categories.map((c) => c.id)).toEqual(k.categories.map((c) => c.categoryId));
    expect(menu.items.map((i) => i.itemId)).toEqual(k.items.map((i) => i.itemId));
  });

  it("keeps prices, groups and facts the model may quote", () => {
    expect(cheese.name).toEqual({ ko: "치즈버거", en: "Cheeseburger" });
    expect(cheese.variants).toEqual(k.items[0].variants);
    expect(cheese.allergens).toContain("milk");
    expect(cheese.kcal).toBe(520);
    const drink = cheese.groups.find((g) => g.groupId === "drink")!;
    expect(drink).toMatchObject({ required: true, min: 1, max: 1, default: [], appliesTo: ["set", "largeSet"] });
    expect(drink.options.find((o) => o.id === "iced_coffee")).toEqual({
      id: "iced_coffee",
      name: { ko: "아이스커피", en: "Iced coffee" },
      priceDelta: 500,
      soldOut: false,
    });
    expect(cheese.groups.find((g) => g.groupId === "side")!.default).toEqual(["fries_m"]);
  });

  it("keeps the best/new badge so popularity questions have a data answer", () => {
    expect(cheese.badge).toBe("best");
    expect(menu.items.find((i) => i.itemId === "soft_cone")!.badge).toBe("best");
    expect(menu.items.find((i) => i.itemId === "spicy_chicken_burger")!.badge).toBe("new");
    expect(menu.items.find((i) => i.itemId === "apple_pie")!.badge).toBeNull();
  });

  it("keeps sold-out and hours", () => {
    expect(menu.items.find((i) => i.itemId === "shrimp_burger")!.soldOut).toBe(true);
    expect(menu.items.find((i) => i.itemId === "egg_muffin")!.hours).toBe("05:00-10:30");
  });

  it("leaves out images and theme", () => {
    const json = JSON.stringify(menu);
    expect(json).not.toContain("/menu/");
    expect(json).not.toContain(k.theme.primary);
  });

  it("names things in Korean and English only: the ticket machine's Japanese screen names stay on the kiosk", () => {
    const rail = getKiosk("airport_rail");
    const json = JSON.stringify(menuForModel(rail));
    expect(json).not.toMatch(/"ja"/);
    expect(json).not.toMatch(/[\p{Script=Hiragana}\p{Script=Katakana}]/u);
    const express = menuForModel(rail).items.find((i) => i.itemId === "express_city_center")!;
    expect(express.name).toEqual({ ko: "직통열차 시티센터", en: "Express to City Center" });
    expect(express.subtitle).toEqual({ ko: "직통 · 39분", en: "Non-stop · 39 min" });
    expect(express.groups[0].name).toEqual({ ko: "승객", en: "Passenger" });
    expect(express.groups[0].options[0].name).toEqual({ ko: "어른", en: "Adult" });
  });
});
