import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import raw from "../../../data/kiosks/malo.json";
import type { LocalizedName } from "@/types/menu";
import {
  findItem,
  findOption,
  getKiosk,
  groupsFor,
  isAvailableNow,
  isKioskId,
  kioskSchema,
  localName,
} from "./catalog";

const kiosk = getKiosk("malo");
const publicDir = join(process.cwd(), "public");

function allNames(): LocalizedName[] {
  const names: LocalizedName[] = [
    kiosk.brand.name,
    kiosk.brand.tagline,
    kiosk.dineOptions.eat_in.name,
    kiosk.dineOptions.take_out.name,
    ...kiosk.categories.map((c) => c.name),
  ];
  for (const item of kiosk.items) {
    names.push(item.name);
    for (const g of item.optionGroups) {
      names.push(g.name, ...g.options.map((o) => o.name));
    }
  }
  return names;
}

describe("malo.json", () => {
  it("parses with kioskSchema", () => {
    expect(kioskSchema.safeParse(raw).success).toBe(true);
  });

  it("has 7 categories and 34-37 items in known categories", () => {
    expect(kiosk.categories).toHaveLength(7);
    expect(kiosk.items.length).toBeGreaterThanOrEqual(34);
    expect(kiosk.items.length).toBeLessThanOrEqual(37);
    const cats = new Set(kiosk.categories.map((c) => c.categoryId));
    for (const item of kiosk.items) expect(cats, item.itemId).toContain(item.category);
  });

  it("has unique ids for categories, items, groups and options", () => {
    const unique = (ids: string[]) => new Set(ids).size === ids.length;
    expect(unique(kiosk.categories.map((c) => c.categoryId))).toBe(true);
    expect(unique(kiosk.items.map((i) => i.itemId))).toBe(true);
    for (const item of kiosk.items) {
      expect(unique(item.optionGroups.map((g) => g.groupId)), item.itemId).toBe(true);
      for (const g of item.optionGroups) {
        expect(unique(g.options.map((o) => o.optionId)), `${item.itemId}.${g.groupId}`).toBe(true);
      }
    }
  });

  it("points every image at a file under public/", () => {
    const paths = [
      kiosk.dineOptions.eat_in.image,
      kiosk.dineOptions.take_out.image,
      ...kiosk.categories.map((c) => c.icon),
    ];
    for (const item of kiosk.items) {
      paths.push(item.image);
      for (const g of item.optionGroups) {
        for (const o of g.options) if (o.image) paths.push(o.image);
      }
    }
    for (const p of paths) {
      expect(p.startsWith("/menu/"), p).toBe(true);
      expect(existsSync(join(publicDir, p)), p).toBe(true);
    }
  });

  it("has short single-line names in Korean and English", () => {
    for (const n of allNames()) {
      for (const s of [n.ko, n.en]) {
        expect(s.trim().length, JSON.stringify(n)).toBeGreaterThan(0);
        expect(s.length, s).toBeLessThanOrEqual(40);
        expect(s, s).not.toMatch(/[\r\n]/);
      }
    }
  });

  it("contains no real brand names", () => {
    const text = JSON.stringify(raw).toLowerCase();
    const brands = [
      "coca", "pepsi", "sprite", "fanta", "chilsung", "mcdonald", "burger king",
      "lotteria", "kfc", "mom's touch", "starbucks", "ediya", "twosome", "dunkin",
      "baskin", "subway",
      "코카", "펩시", "스프라이트", "환타", "칠성", "맥도날드", "버거킹", "롯데리아",
      "맘스터치", "스타벅스", "이디야", "투썸", "던킨", "배스킨", "써브웨이",
    ];
    for (const b of brands) expect(text, b).not.toContain(b);
  });

  it("makes no health or religious claims", () => {
    const text = JSON.stringify(raw).toLowerCase();
    for (const w of ["halal", "vegan", "vegetarian", "gluten", "kosher", "할랄", "비건"]) {
      expect(text, w).not.toContain(w);
    }
  });

  it("gives every burger single/set/largeSet and the side, drink, ingredients groups", () => {
    const burgers = kiosk.items.filter((i) => i.category === "burger");
    expect(burgers).toHaveLength(8);
    for (const b of burgers) {
      const single = b.variants.find((v) => v.variant === "single")!.price;
      expect(b.variants, b.itemId).toEqual([
        { variant: "single", price: single },
        { variant: "set", price: single + 2000 },
        { variant: "largeSet", price: single + 2700 },
      ]);
      const shape = b.optionGroups.map((g) => ({
        groupId: g.groupId,
        appliesTo: g.appliesTo,
        required: g.required,
        min: g.min,
        max: g.max,
        defaultOptionIds: g.defaultOptionIds,
        options: g.options.map((o) => [o.optionId, o.priceDelta]),
      }));
      expect(shape, b.itemId).toEqual([
        {
          groupId: "side", appliesTo: ["set", "largeSet"], required: true, min: 1, max: 1,
          defaultOptionIds: ["fries_m"],
          options: [["fries_m", 0], ["fries_l", 500], ["cheese_sticks", 1000], ["coleslaw", 0]],
        },
        {
          groupId: "drink", appliesTo: ["set", "largeSet"], required: true, min: 1, max: 1,
          defaultOptionIds: [],
          options: [["cola", 0], ["zero_cola", 0], ["cider", 0], ["iced_coffee", 500]],
        },
        {
          groupId: "ingredients", appliesTo: ["single", "set", "largeSet"], required: false, min: 0, max: 3,
          defaultOptionIds: [],
          options: [["no_pickles", 0], ["no_onion", 0], ["extra_cheese", 500], ["extra_patty", 1500]],
        },
      ]);
    }
  });

  it("has the required items and prices", () => {
    const price = (id: string) => findItem(kiosk, id)?.variants.find((v) => v.variant === "single")?.price;
    expect(price("cheese_burger")).toBe(4900);
    expect(price("bulgogi_burger")).toBe(5200);
    expect(price("double_cheese_burger")).toBe(6400);
    expect(price("spicy_chicken_burger")).toBe(5600);
    expect(price("shrimp_burger")).toBe(5500);
    expect(price("fries_m")).toBe(2000);
    expect(price("fries_l")).toBe(2500);
    expect(price("cheese_sticks")).toBe(2500);
    expect(price("coleslaw")).toBe(1800);
    expect(price("cola")).toBe(1800);
    expect(price("zero_cola")).toBe(1800);
    expect(price("cider")).toBe(1800);
    expect(price("iced_coffee")).toBe(2300);
    expect(price("soft_cone")).toBe(1000);
    expect(price("apple_pie")).toBe(1600);
    expect(findItem(kiosk, "cheese_burger")?.badge).toBe("best");
    expect(findItem(kiosk, "spicy_chicken_burger")?.badge).toBe("new");
    expect(findItem(kiosk, "soft_cone")?.badge).toBe("best");
  });

  it("has nuggets with a required sauce group and no default", () => {
    const sauce = findItem(kiosk, "chicken_nuggets")?.optionGroups.find((g) => g.groupId === "sauce");
    expect(sauce).toMatchObject({ required: true, min: 1, max: 1, defaultOptionIds: [] });
  });

  it("gives soft drinks a required size group defaulting to m", () => {
    for (const id of ["cola", "zero_cola", "cider"]) {
      const size = findItem(kiosk, id)?.optionGroups.find((g) => g.groupId === "size");
      expect(size, id).toMatchObject({ required: true, defaultOptionIds: ["m"] });
      expect(size?.options.map((o) => [o.optionId, o.priceDelta]), id).toEqual([["m", 0], ["l", 500]]);
    }
  });

  it("keeps groups consistent: defaults exist, min <= max, required means min >= 1", () => {
    for (const item of kiosk.items) {
      for (const g of item.optionGroups) {
        const where = `${item.itemId}.${g.groupId}`;
        for (const d of g.defaultOptionIds) expect(findOption(g, d), where).toBeDefined();
        expect(g.min, where).toBeLessThanOrEqual(g.max);
        if (g.required) expect(g.min, where).toBeGreaterThanOrEqual(1);
        expect(g.appliesTo.length, where).toBeGreaterThan(0);
        for (const v of g.appliesTo) {
          expect(item.variants.map((x) => x.variant), where).toContain(v);
        }
      }
    }
  });

  it("uses integer KRW prices in multiples of 100", () => {
    for (const item of kiosk.items) {
      for (const v of item.variants) expect(v.price % 100, item.itemId).toBe(0);
      for (const g of item.optionGroups) {
        for (const o of g.options) expect(o.priceDelta % 100, `${item.itemId}.${o.optionId}`).toBe(0);
      }
    }
  });

  it("has upsell rules that point at real items", () => {
    expect(kiosk.upsellRules).toEqual([
      { whenCategory: "burger", offerItemIds: ["soft_cone", "apple_pie"] },
      { whenCategory: "chicken", offerItemIds: ["soft_cone"] },
    ]);
    for (const r of kiosk.upsellRules) {
      for (const id of r.offerItemIds) expect(findItem(kiosk, id), id).toBeDefined();
    }
  });

  it("marks shrimp_burger sold out and gives every morning item hours", () => {
    expect(findItem(kiosk, "shrimp_burger")?.soldOut).toBe(true);
    const morning = kiosk.items.filter((i) => i.category === "morning");
    expect(morning).toHaveLength(3);
    for (const m of morning) expect(m.availableHours, m.itemId).toBe("05:00-10:30");
  });
});

describe("catalog helpers", () => {
  it("getKiosk throws for unknown ids; isKioskId narrows", () => {
    expect(() => getKiosk("nope")).toThrow();
    expect(isKioskId("malo")).toBe(true);
    expect(isKioskId("nope")).toBe(false);
  });

  it("caches the parsed kiosk", () => {
    expect(getKiosk("malo")).toBe(kiosk);
  });

  it("groupsFor filters by variant", () => {
    const burger = findItem(kiosk, "cheese_burger")!;
    expect(groupsFor(burger, "single").map((g) => g.groupId)).toEqual(["ingredients"]);
    expect(groupsFor(burger, "set").map((g) => g.groupId)).toEqual(["side", "drink", "ingredients"]);
    expect(findItem(kiosk, "no_such_item")).toBeUndefined();
  });

  it("isAvailableNow uses KST with an exclusive end", () => {
    const item = kiosk.items.find((i) => i.category === "morning")!;
    expect(isAvailableNow(item, Date.UTC(2026, 9, 13, 0, 0))).toBe(true); // 09:00 KST
    expect(isAvailableNow(item, Date.UTC(2026, 9, 13, 2, 0))).toBe(false); // 11:00 KST
    expect(isAvailableNow(item, Date.UTC(2026, 9, 12, 20, 0))).toBe(true); // 05:00 KST
    expect(isAvailableNow(item, Date.UTC(2026, 9, 13, 1, 30))).toBe(false); // 10:30 KST
    expect(isAvailableNow(findItem(kiosk, "cheese_burger")!, Date.UTC(2026, 9, 13, 2, 0))).toBe(true);
  });

  it("localName picks the locale", () => {
    expect(localName({ ko: "콜라", en: "Cola" }, "ko")).toBe("콜라");
    expect(localName({ ko: "콜라", en: "Cola" }, "en")).toBe("Cola");
  });
});
