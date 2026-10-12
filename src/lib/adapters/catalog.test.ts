import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import raw from "../../../data/kiosks/malo.json";
import type { KioskData, LocalizedName } from "@/types/menu";
import {
  allKioskIds,
  findItem,
  findOption,
  getKiosk,
  groupsFor,
  isAvailableNow,
  isKioskId,
  kioskSchema,
  localName,
  vocabularyOf,
} from "./catalog";

const kiosk = getKiosk("malo");
const publicDir = join(process.cwd(), "public");

function allNames(k: KioskData): LocalizedName[] {
  const names: LocalizedName[] = [k.brand.name, k.brand.tagline, ...k.categories.map((c) => c.name)];
  if (k.dineOptions) names.push(k.dineOptions.eat_in.name, k.dineOptions.take_out.name);
  if (k.vocabulary) names.push(k.vocabulary.item, k.vocabulary.add, k.vocabulary.cart);
  for (const item of k.items) {
    names.push(item.name);
    if (item.subtitle) names.push(item.subtitle);
    for (const g of item.optionGroups) {
      names.push(g.name, ...g.options.map((o) => o.name));
    }
  }
  return names;
}

/** The lowest unit price any valid selection can reach: each group takes up to `max` of its most negative deltas. */
function lowestFare(k: KioskData, itemId: string): number {
  const item = findItem(k, itemId)!;
  let lowest = Infinity;
  for (const v of item.variants) {
    let price = v.price;
    for (const g of groupsFor(item, v.variant)) {
      const negatives = g.options.map((o) => o.priceDelta).filter((d) => d < 0).sort((a, b) => a - b);
      price += negatives.slice(0, g.max).reduce((sum, d) => sum + d, 0);
    }
    lowest = Math.min(lowest, price);
  }
  return lowest;
}

const BRANDS = [
  "coca", "pepsi", "sprite", "fanta", "chilsung", "mcdonald", "burger king",
  "lotteria", "kfc", "mom's touch", "starbucks", "ediya", "twosome", "dunkin",
  "baskin", "subway", "domino", "pizza hut", "korail", "arex",
  "코카", "펩시", "스프라이트", "환타", "칠성", "맥도날드", "버거킹", "롯데리아",
  "맘스터치", "스타벅스", "이디야", "투썸", "던킨", "배스킨", "써브웨이", "도미노", "피자헛",
  "코레일", "공항철도",
];

describe.each(allKioskIds())("kiosk %s (generic checks)", (id) => {
  const k = getKiosk(id);

  it("has unique ids for categories, items, groups and options, and items in known categories", () => {
    const unique = (ids: string[]) => new Set(ids).size === ids.length;
    expect(unique(k.categories.map((c) => c.categoryId))).toBe(true);
    expect(unique(k.items.map((i) => i.itemId))).toBe(true);
    const cats = new Set(k.categories.map((c) => c.categoryId));
    for (const item of k.items) {
      expect(cats, item.itemId).toContain(item.category);
      expect(unique(item.optionGroups.map((g) => g.groupId)), item.itemId).toBe(true);
      for (const g of item.optionGroups) {
        expect(unique(g.options.map((o) => o.optionId)), `${item.itemId}.${g.groupId}`).toBe(true);
      }
    }
  });

  it("has short single-line names in Korean and English", () => {
    for (const n of allNames(k)) {
      for (const s of [n.ko, n.en]) {
        expect(s.trim().length, JSON.stringify(n)).toBeGreaterThan(0);
        expect(s.length, s).toBeLessThanOrEqual(40);
        expect(s, s).not.toMatch(/[\r\n]/);
      }
    }
  });

  it("points every image at a file under public/", () => {
    const paths = [...k.categories.map((c) => c.icon)];
    if (k.dineOptions) paths.push(k.dineOptions.eat_in.image, k.dineOptions.take_out.image);
    for (const item of k.items) {
      paths.push(item.image);
      for (const g of item.optionGroups) {
        for (const o of g.options) if (o.image) paths.push(o.image);
      }
    }
    for (const p of paths) expect(existsSync(join(publicDir, p)), p).toBe(true);
  });

  it("keeps groups consistent: defaults exist, min <= max, required means min >= 1", () => {
    for (const item of k.items) {
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

  it("contains no real brand names", () => {
    const text = JSON.stringify(k).toLowerCase();
    for (const b of BRANDS) expect(text, b).not.toContain(b);
  });

  it("uses KRW prices in multiples of 10, and no selection makes a fare negative", () => {
    for (const item of k.items) {
      for (const v of item.variants) expect(v.price % 10, item.itemId).toBe(0);
      for (const g of item.optionGroups) {
        for (const o of g.options) expect(o.priceDelta % 10, `${item.itemId}.${o.optionId}`).toBe(0);
      }
      expect(lowestFare(k, item.itemId), item.itemId).toBeGreaterThanOrEqual(0);
    }
  });

  it("has a domain, and a default locale that its own screen offers", () => {
    expect(["food", "ticket"]).toContain(k.domain);
    expect(k.locales).toContain(k.locale);
  });
});

describe("kioskSchema (domain model)", () => {
  /** MALO without dine options, as a ticket kiosk with one child fare. */
  function ticketRaw() {
    const t = structuredClone(raw) as Record<string, unknown> & { items: Record<string, unknown>[] };
    delete t.dineOptions;
    t.domain = "ticket";
    t.locales = ["ko", "en"];
    t.vocabulary = {
      item: { ko: "승차권", en: "ticket" },
      add: { ko: "선택", en: "Select" },
      cart: { ko: "선택한 승차권", en: "Selected tickets" },
    };
    t.items[0].kcal = null;
    t.items[0].allergens = [];
    t.items[0].subtitle = { ko: "직통 · 43분", en: "Non-stop · 43 min" };
    const groups = t.items[0].optionGroups as { options: { priceDelta: number }[] }[];
    groups[0].options[0].priceDelta = -1000;
    return t;
  }

  it("accepts a ticket kiosk: no dine options, null kcal, subtitle, negative delta, vocabulary, locales", () => {
    const parsed = kioskSchema.safeParse(ticketRaw());
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.data?.dineOptions).toBeUndefined();
    expect(parsed.data?.items[0].kcal).toBeNull();
  });

  it("defaults locales to Korean only and rejects other languages", () => {
    expect(kioskSchema.parse(raw).locales).toEqual(["ko"]);
    expect(kioskSchema.safeParse({ ...ticketRaw(), locales: ["ko", "ja"] }).success).toBe(false);
  });

  it("requires a known domain", () => {
    const noDomain = ticketRaw();
    delete noDomain.domain;
    expect(kioskSchema.safeParse(noDomain).success).toBe(false);
    expect(kioskSchema.safeParse({ ...ticketRaw(), domain: "hospital" }).success).toBe(false);
  });

  it("vocabularyOf falls back to food words", () => {
    expect(vocabularyOf(kiosk)).toEqual({
      item: { ko: "메뉴", en: "menu" },
      add: { ko: "담기", en: "Add" },
      cart: { ko: "장바구니", en: "Cart" },
    });
    const t = kioskSchema.parse(ticketRaw());
    expect(vocabularyOf(t).cart).toEqual({ ko: "선택한 승차권", en: "Selected tickets" });
  });
});

describe("malo.json", () => {
  it("parses with kioskSchema as a food kiosk with dine options", () => {
    expect(kioskSchema.safeParse(raw).success).toBe(true);
    expect(kiosk.domain).toBe("food");
    expect(kiosk.dineOptions).toBeDefined();
  });

  it("has 7 categories and 34-37 items", () => {
    expect(kiosk.categories).toHaveLength(7);
    expect(kiosk.items.length).toBeGreaterThanOrEqual(34);
    expect(kiosk.items.length).toBeLessThanOrEqual(37);
  });

  it("keeps its images under /menu/", () => {
    expect(kiosk.dineOptions?.eat_in.image).toBe("/menu/dine_in.jpg");
    for (const item of kiosk.items) expect(item.image.startsWith("/menu/"), item.itemId).toBe(true);
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

  it("allKioskIds lists every kiosk", () => {
    expect(allKioskIds()).toEqual(["malo", "doughhouse"]);
    for (const id of allKioskIds()) expect(isKioskId(id)).toBe(true);
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
