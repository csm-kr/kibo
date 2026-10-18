import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import raw from "../../../skills/bunsik.json";
import { resolveLine } from "@/lib/commands/cart";
import type { RecipeStep } from "@/types/menu";
import { allKioskIds, findItem, getKiosk } from "./catalog";
import { isForbiddenLabel, learnedToKiosk, skillSchema } from "./learned";

// 보리별 분식 (bk9-bunsik), the bunsik shop kiosk KIBO learned blind in round 4, as a public learned kiosk on /demo
// (I-405). The skill is the learner's own output (spikes/blind-kiosks/results/bk9-bunsik/final/skill.json) converted
// by `npm run skill:import`, plus only what a person adds in review: ids, English names, the cart line reading, the
// removal recipe, the review order button as a forbidden label and the page's fixed size.

const skill = skillSchema.parse(raw);
const kiosk = learnedToKiosk(skill);
const publicDir = join(process.cwd(), "public");
const NOW = Date.UTC(2026, 9, 18, 3, 0);

function recipeLabels(steps: RecipeStep[]): string[] {
  return steps.flatMap((s) => [...(s.label ? [s.label] : []), ...recipeLabels(s.steps ?? [])]);
}

describe("skills/bunsik.json", () => {
  it("parses, is in the catalog and is reviewed", () => {
    expect(skillSchema.safeParse(raw).success).toBe(true);
    expect(allKioskIds()).toContain("bunsik");
    expect(getKiosk("bunsik")).toEqual(kiosk);
    expect(skill.provenance).toEqual({
      learnedBy: "gemini-3.8-flash",
      evidence: "spikes/blind-kiosks/results/bk9-bunsik/final/skill.json",
      reviewed: "2026-10-18",
    });
    expect(skill.page).toBe("/learned-kiosks/bunsik/index.html");
  });

  it("adds the review fields: the delete recipe, the cart line reading, the order buttons as forbidden, the page size", () => {
    // That the rest is the learner's own skill is checked in scripts/skill-import.test.ts (spikes/ is not in the build).
    expect(skill.catalog).toHaveLength(32);
    expect(skill.recipes.removeLine).toEqual([
      { op: "clickNth", label: "삭제", index: "{lineIndex}" },
      { op: "click", label: "삭제", within: "선택한 메뉴를 삭제할까요?" },
    ]);
    expect(skill.forbiddenLabels.slice(-2)).toEqual(["주문 확인하기", "주문하기"]);
    expect(skill.checkout).toEqual({ label: "주문 확인하기", name: { ko: "주문 확인하기", en: "Review order" } });
    expect(skill.cartTotalPattern).toBe("총 \\d+개\\s+([\\d,]+)원");
    expect(skill.pageSize).toEqual({ width: 720, height: 1280 });
  });

  it("uses only known labels in recipes, never a forbidden one, and refuses the order and payment buttons", () => {
    // Plus the home screen's tile, which the learner named by its largest text, the store's name (not a uiLabel).
    const home = skill.recipes.startOrder[0].label;
    expect(home).toBe("보리별 분식");
    const known = new Set([home, ...skill.uiLabels, ...skill.categories.map((c) => c.label), skill.dineOptions.eat_in, skill.dineOptions.take_out]);
    const labels = Object.values(skill.recipes).flatMap(recipeLabels);
    for (const label of labels) {
      if (!/^\{\w+\}$/.test(label)) expect(known, label).toContain(label);
    }
    for (const label of [...labels, ...skill.uiLabels.filter((l) => l !== "주문 확인하기")]) {
      expect(isForbiddenLabel(label, skill.forbiddenLabels), label).toBe(false);
    }
    for (const label of ["주문 확인하기", "주문하기", "‹ 처음으로", "신용/체크카드", "간편결제", "모바일 상품권", "결제하실 금액"]) {
      expect(isForbiddenLabel(label, skill.forbiddenLabels), label).toBe(true);
    }
  });

  it("has ASCII ids and plain English names for every category, item, group and option", () => {
    const hangul = /\p{Script=Hangul}/u;
    const names = [
      skill.brand,
      ...skill.categories.map((c) => c.name),
      ...skill.catalog.flatMap((i) => [i.name, ...i.optionGroups.flatMap((g) => [g.name, ...g.options.map((o) => o.name)])]),
    ];
    for (const n of names) expect(n.en, n.ko).not.toMatch(hangul);
    expect(skill.brand).toEqual({ ko: "보리별 분식", en: "Boribyeol Bunsik" });
    // Each Korean name is the kiosk's own label.
    for (const i of skill.catalog) expect(i.name.ko).toBe(i.label);
  });

  it("keeps every item and price of the kiosk page, and the page is the blind kiosk's app with only its photos added", () => {
    const dir = join(publicDir, "learned-kiosks/bunsik");
    const spike = join(process.cwd(), "spikes/blind-kiosks/bk9-bunsik/app");
    const read = (d: string, f: string) => readFileSync(join(d, f), "utf8");
    expect(readdirSync(dir).filter((f) => f !== "img").sort()).toEqual(readdirSync(spike).sort());
    for (const f of ["index.html", "menu.js"]) expect(read(dir, f), f).toBe(read(spike, f));
    // Food photos (10-18, after learning): each thumbnail names its item in a data-img attribute, nothing else in the
    // app changed, and the stylesheet only gains a block at its end. The page's text and labels stay as learned.
    const app = read(spike, "app.js")
      .replace("  function thumb(it, cls) {\n", "  function thumb(it, cls) {\n    var img = it.id ? ' data-img=\"' + it.id + '\"' : '';\n")
      .replace(" t-gimbap\"><div class=\"roll", " t-gimbap\"' + img + '><div class=\"roll")
      .replace(" t-' + it.cat + '\"><span", " t-' + it.cat + '\"' + img + '><span");
    expect(read(dir, "app.js")).toBe(app);
    expect(read(dir, "style.css").startsWith(read(spike, "style.css"))).toBe(true);
    expect(read(dir, "style.css").slice(read(spike, "style.css").length)).toMatch(/^\n\/\* ---------- food photos \(10-18, added after learning\)/);
    const menu = readFileSync(join(dir, "menu.js"), "utf8");
    for (const item of skill.catalog) {
      // 로제 떡볶이 is on today's discount: the kiosk charges its promo price.
      const price = item.label === "로제 떡볶이" ? "price: 6500, icon: '🍲',\n      promo: { price: 5500" : `price: ${item.price}`;
      expect(menu, item.label).toContain(`name: '${item.label}', ${price}`);
    }
  });
});

describe("resolveLine on the bunsik shop", () => {
  it("prices holdout h4's set with its upgrades, and h1's tteokbokki with two toppings", () => {
    const set = resolveLine(kiosk, {
      itemId: "boribyeol_set",
      selections: { set_tteok: ["tteok_rose"], set_spice: ["lv4"], set_gimbap: ["gimbap_tuna"], set_gimbap_cut: ["cut"], set_drink: ["drink_sikhye"] },
    }, NOW);
    expect(set.unitPrice).toBe(9900 + 1500 + 500 + 500);
    const tteok = resolveLine(kiosk, {
      itemId: "boribyeol_tteokbokki",
      selections: { spice: ["lv3"], tteok_topping: ["boiled_egg", "extra_fishcake"] },
    }, NOW);
    expect(tteok.unitPrice).toBe(8000 - 2000);
  });

  it("asks for the spice level, refuses the sold-out anchovy gimbap and a second extra roll (I-190)", () => {
    expect(() => resolveLine(kiosk, { itemId: "cheese_tteokbokki" }, NOW)).toThrow(expect.objectContaining({ code: "NEEDS_CHOICE" }));
    expect(findItem(kiosk, "anchovy_gimbap")?.soldOut).toBe(true);
    expect(() => resolveLine(kiosk, { itemId: "anchovy_gimbap", selections: { gimbap_cut: ["cut"] } }, NOW)).toThrow(
      expect.objectContaining({ code: "SOLD_OUT" }),
    );
    const roll = resolveLine(kiosk, { itemId: "tuna_gimbap", selections: { gimbap_cut: ["whole"], gimbap_extra: ["extra_roll"] } }, NOW);
    expect(roll.unitPrice).toBe(4500 + 3000);
    expect(() =>
      resolveLine(kiosk, { itemId: "tuna_gimbap", selections: { gimbap_cut: ["whole"], gimbap_extra: ["extra_roll", "extra_roll"] } }, NOW),
    ).toThrow();
  });
});
