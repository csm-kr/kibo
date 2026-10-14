import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import raw from "../../../skills/doughhouse.json";
import { CommandError } from "@/lib/commands/errors";
import { resolveLine } from "@/lib/commands/cart";
import type { LocalizedName, RecipeStep } from "@/types/menu";
import { findItem, getKiosk, isKioskId } from "./catalog";
import { isForbiddenLabel, learnedToKiosk, skillSchema } from "./learned";

const skill = skillSchema.parse(raw);
const kiosk = learnedToKiosk(skill);
const publicDir = join(process.cwd(), "public");
const NOW = Date.UTC(2026, 9, 13, 3, 0);

function recipeLabels(steps: RecipeStep[]): string[] {
  return steps.flatMap((s) => [...(s.label ? [s.label] : []), ...recipeLabels(s.steps ?? [])]);
}

const allRecipeLabels = Object.values(skill.recipes).flatMap(recipeLabels);

describe("skills/doughhouse.json", () => {
  it("parses with skillSchema", () => {
    expect(skillSchema.safeParse(raw).success).toBe(true);
  });

  it("rejects unknown fields, long or multi-line names, fractional prices and non-ASCII ids", () => {
    const item = skill.catalog[0];
    const bad = [
      { ...skill, extra: 1 },
      { ...skill, catalog: [{ ...item, name: { ko: "가".repeat(41), en: "x" } }] },
      { ...skill, catalog: [{ ...item, label: "마르게리따\n주문하기" }] },
      { ...skill, catalog: [{ ...item, price: 15900.5 }] },
      { ...skill, catalog: [{ ...item, itemId: "마르게리따" }] },
    ];
    for (const b of bad) expect(skillSchema.safeParse(b).success).toBe(false);
  });

  it("accepts within, chooseOptions and a group's select and after steps (13-blind-kiosks:4), and passes them to the bridge", () => {
    const steps = [{ op: "click", label: "+", within: "{option}" }];
    const item = { ...skill.catalog[0], optionGroups: [{ ...skill.catalog[0].optionGroups[0], select: steps, after: [{ op: "click", label: "다음" }] }] };
    const withSteps = { ...skill, catalog: [item], recipes: { ...skill.recipes, addToCart: [{ op: "chooseOptions", steps: [{ op: "click", label: "{option}" }] }] } };
    const parsed = skillSchema.parse(withSteps);
    expect(learnedToKiosk(parsed).learned?.groupSteps).toEqual({ [item.optionGroups[0].groupId]: { select: steps, after: [{ op: "click", label: "다음" }] } });
    expect(learnedToKiosk(skill).learned?.groupSteps).toEqual({});
    expect(skillSchema.safeParse({ ...withSteps, recipes: { addToCart: [{ op: "click", label: "+", within: "a\nb" }] } }).success).toBe(false);
    // One group id on two items must mean the same steps, as one option id means one label.
    const twice = skillSchema.parse({ ...withSteps, catalog: [item, skill.catalog[1]] });
    expect(() => learnedToKiosk(twice)).toThrow(/two sets of steps/);
  });

  it("accepts round 3–4 fields (interrupts, declines, a per-item recipe, chooseOptions groups, a group's condition) and passes them to the bridge (I-234)", () => {
    const item = {
      ...skill.catalog[1],
      recipe: "addSetToCart",
      optionGroups: skill.catalog[1].optionGroups.map((g) => (g.groupId === "toppings" ? { ...g, appliesWhen: { groupId: "size", optionId: "large" } } : g)),
    };
    const interrupts = [{ text: "계속 주문하시겠어요?", dismiss: { op: "click" as const, label: "계속 주문하기" } }];
    const declines = [{ choice: "아니요, 괜찮아요", offer: "사이드 추가", name: { ko: "사이드 추가", en: "Add a side" } }];
    const recipes = { ...skill.recipes, addSetToCart: [{ op: "chooseOptions" as const, groups: ["toppings"], steps: [{ op: "click" as const, label: "{option}" }] }] };
    // One group id means one condition, so the other item here has no toppings group.
    const side = skill.catalog.find((i) => i.optionGroups.length === 0)!;
    const parsed = skillSchema.parse({ ...skill, catalog: [side, item], interrupts, declines, recipes });
    const learned = learnedToKiosk(parsed).learned!;
    expect(learned.interrupts).toEqual(interrupts);
    expect(learned.declines).toEqual(declines);
    expect(learned.itemRecipes).toEqual({ pepperoni: "addSetToCart" });
    expect(learned.groupSteps.toppings).toEqual({ appliesWhen: { groupId: "size", optionId: "large" } });
    // Older skills carry none of them.
    expect(learnedToKiosk(skill).learned).toMatchObject({ interrupts: [], declines: [], itemRecipes: {} });
  });

  it("refuses an interrupt answer or a decline that is a payment control or an item, category or option, and an unknown recipe or condition", () => {
    const dismiss = (label: string) => ({ ...skill, interrupts: [{ text: "계속 주문하시겠어요?", dismiss: { op: "click", label } }] });
    expect(skillSchema.safeParse(dismiss("계속 주문하기")).success).toBe(true);
    for (const label of ["주문하기", "결제하기", "페퍼로니", "피자", "라지"]) expect(skillSchema.safeParse(dismiss(label)).success, label).toBe(false);
    const decline = (choice: string) => ({ ...skill, declines: [{ choice, offer: "사이드 추가", name: { ko: "사이드", en: "Side" } }] });
    expect(skillSchema.safeParse(decline("아니요, 괜찮아요")).success).toBe(true);
    for (const choice of ["주문하기", "콜라", "씬"]) expect(skillSchema.safeParse(decline(choice)).success, choice).toBe(false);
    expect(skillSchema.safeParse({ ...skill, catalog: [{ ...skill.catalog[0], recipe: "nope" }] }).success).toBe(false);
    const cond = (appliesWhen: object) => ({
      ...skill,
      catalog: [{ ...skill.catalog[0], optionGroups: skill.catalog[0].optionGroups.map((g) => (g.groupId === "toppings" ? { ...g, appliesWhen } : g)) }],
    });
    expect(skillSchema.safeParse(cond({ groupId: "size", optionId: "large" })).success).toBe(true);
    expect(skillSchema.safeParse(cond({ groupId: "size", optionId: "huge" })).success).toBe(false);
    expect(skillSchema.safeParse(cond({ groupId: "toppings", optionId: "olive" })).success).toBe(false);
  });

  it("uses only known labels in recipes: placeholders, uiLabels, category or dine labels", () => {
    const known = new Set([
      ...skill.uiLabels,
      ...skill.categories.map((c) => c.label),
      skill.dineOptions.eat_in,
      skill.dineOptions.take_out,
    ]);
    for (const label of allRecipeLabels) {
      if (/^\{\w+\}$/.test(label)) continue;
      expect(known, label).toContain(label);
    }
  });

  it("never clicks a forbidden label and forbids payment and checkout", () => {
    for (const label of [...allRecipeLabels, ...skill.uiLabels]) {
      expect(isForbiddenLabel(label, skill.forbiddenLabels), label).toBe(false);
    }
    for (const label of ["주문하기", "💳 신용/체크카드", "결제 방법을 선택하세요", "카드를 투입구에 넣어주세요"]) {
      expect(isForbiddenLabel(label, skill.forbiddenLabels), label).toBe(true);
    }
  });

  it("I-234: keeps refusing payment controls but lets keep-ordering labels through", () => {
    const f = skill.forbiddenLabels;
    // Real payment and checkout controls stay refused, also with spacing, case or a price beside them.
    for (const label of ["주문하기", "주문 하기", "결제하기", "카드 결제", "💳 신용/체크카드", "Pay", "Pay now", "Checkout",
      "계속 결제하기", "Continue to checkout", "Continue to payment", "결제 취소", "주문하기 23,400원"]) {
      expect(isForbiddenLabel(label, f), label).toBe(true);
    }
    // A control that keeps the order going, or a real choice, is not a payment control.
    for (const label of ["계속 주문하기", "계속 주문", "더 담기", "Continue ordering", "Cancel", "곱빼기", "라지", "삭제"]) {
      expect(isForbiddenLabel(label, f), label).toBe(false);
    }
    // A target whose text holds a payment line is refused even when another line keeps ordering.
    expect(isForbiddenLabel("더 담기\n주문하기", f)).toBe(true);
    // A keep-ordering word only frees a label it starts: "주문하기 계속" is still the order button.
    expect(isForbiddenLabel("주문하기 계속", f)).toBe(true);
  });

  it("removes a line with the kiosk's own delete button", () => {
    expect(skill.recipes.removeLine).toEqual([{ op: "clickNth", label: "삭제", index: "{lineIndex}" }]);
  });

  it("has a cart line pattern that reads the kiosk's cart text", () => {
    const re = new RegExp(skill.cartLinePattern);
    expect("페퍼로니 (라지, 씬, 베이컨, 올리브) x1 24,200원 삭제".match(re)?.slice(1)).toEqual([
      "페퍼로니", "라지, 씬, 베이컨, 올리브", "1", "24,200",
    ]);
    expect("갈릭디핑소스 x2 1,000원 삭제".match(re)?.slice(1)).toEqual(["갈릭디핑소스", undefined, "2", "1,000"]);
    expect("장바구니 3개 · 합계 25,200원".match(new RegExp(skill.cartTotalPattern))?.[1]).toBe("25,200");
  });

  it("keeps every item and price of the kiosk page", () => {
    const page = readFileSync(join(publicDir, skill.page), "utf8");
    for (const item of skill.catalog) {
      expect(page, item.label).toContain(`name: '${item.label}', price: ${item.price}`);
    }
    expect(skill.catalog).toHaveLength(10);
  });

  it("is byte-identical to the spike kiosk page", () => {
    const spike = readFileSync(join(process.cwd(), "spikes/kibo-learn/kiosk/index.html"));
    expect(readFileSync(join(publicDir, skill.page)).equals(spike)).toBe(true);
  });
});

describe("learnedToKiosk", () => {
  it("is what getKiosk returns for doughhouse", () => {
    expect(isKioskId("doughhouse")).toBe(true);
    expect(getKiosk("doughhouse")).toEqual(kiosk);
    expect(getKiosk("doughhouse")).toBe(getKiosk("doughhouse"));
    expect(getKiosk("malo").kind).toBe("direct");
    expect(getKiosk("malo").learned).toBeUndefined();
  });

  it("has unique ids, known categories and single variants", () => {
    const unique = (ids: string[]) => new Set(ids).size === ids.length;
    expect(kiosk.kind).toBe("learned");
    expect(unique(kiosk.categories.map((c) => c.categoryId))).toBe(true);
    expect(unique(kiosk.items.map((i) => i.itemId))).toBe(true);
    const cats = new Set(kiosk.categories.map((c) => c.categoryId));
    for (const item of kiosk.items) {
      expect(cats, item.itemId).toContain(item.category);
      expect(item.variants).toHaveLength(1);
      expect(item.variants[0].variant).toBe("single");
      expect(unique(item.optionGroups.map((g) => g.groupId)), item.itemId).toBe(true);
      for (const g of item.optionGroups) {
        expect(g.appliesTo).toEqual(["single"]);
        expect(unique(g.options.map((o) => o.optionId)), `${item.itemId}.${g.groupId}`).toBe(true);
      }
    }
    expect(kiosk.upsellRules).toEqual([]);
  });

  it("has short single-line names in Korean and English", () => {
    const names: LocalizedName[] = [
      kiosk.brand.name,
      kiosk.brand.tagline,
      kiosk.dineOptions!.eat_in.name,
      kiosk.dineOptions!.take_out.name,
      ...kiosk.categories.map((c) => c.name),
    ];
    for (const item of kiosk.items) {
      names.push(item.name);
      for (const g of item.optionGroups) names.push(g.name, ...g.options.map((o) => o.name));
    }
    for (const n of names) {
      for (const s of [n.ko, n.en]) {
        expect(s.trim().length, JSON.stringify(n)).toBeGreaterThan(0);
        expect(s.length, s).toBeLessThanOrEqual(40);
        expect(s, s).not.toMatch(/[\r\n]/);
      }
    }
  });

  it("points every image at a file under public/", () => {
    const paths = [
      kiosk.dineOptions!.eat_in.image,
      kiosk.dineOptions!.take_out.image,
      ...kiosk.categories.map((c) => c.icon),
      ...kiosk.items.map((i) => i.image),
    ];
    for (const p of paths) expect(existsSync(join(publicDir, p)), p).toBe(true);
  });

  it("keeps the kiosk labels for the bridge", () => {
    const l = kiosk.learned!;
    expect(l.page).toBe("/learned-kiosks/doughhouse/index.html");
    expect(l.dineLabels).toEqual({ eat_in: "🍽 먹고 갈게요", take_out: "🛍 가져갈게요" });
    expect(l.labels.items.pepperoni).toBe("페퍼로니");
    expect(l.labels.categories.pizza).toBe("피자");
    expect(l.labels.options.large).toBe("라지");
    expect(l.labels.options.ml_500).toBe("500ml");
    expect(l.forbiddenLabels).toEqual(skill.forbiddenLabels);
    expect(l.recipes).toEqual(skill.recipes);
  });

  it("names the kiosk's own checkout label for the phone, and the bridge never clicks it", () => {
    expect(kiosk.learned!.checkout).toEqual({ label: "주문하기", name: { ko: "주문하기", en: "Order" } });
    expect(isForbiddenLabel(skill.checkout.label, skill.forbiddenLabels)).toBe(true);
    const clickable = { ...skill, checkout: { ...skill.checkout, label: "장바구니 담기" } };
    expect(skillSchema.safeParse(clickable).success).toBe(false);
  });

  it("contains no real brand names", () => {
    const text = JSON.stringify(raw).toLowerCase();
    for (const b of ["coca", "pepsi", "sprite", "chilsung", "domino", "pizza hut", "papa john", "mr. pizza",
      "코카", "펩시", "스프라이트", "칠성", "도미노", "피자헛", "파파존스", "미스터피자"]) {
      expect(text, b).not.toContain(b);
    }
  });
});

describe("resolveLine on the learned kiosk", () => {
  it("prices a large pepperoni, thin dough, bacon and olive", () => {
    const line = resolveLine(kiosk, {
      itemId: "pepperoni",
      qty: 1,
      selections: { size: ["large"], dough: ["thin"], toppings: ["bacon", "olive"] },
    }, NOW);
    expect(line.variant).toBe("single");
    expect(line.unitPrice).toBe(17900 + 4000 + 0 + 1500 + 800);
  });

  it("rejects the sold-out potato pizza", () => {
    expect(findItem(kiosk, "potato_pizza")?.soldOut).toBe(true);
    expect(() => resolveLine(kiosk, {
      itemId: "potato_pizza",
      selections: { size: ["regular"], dough: ["original"] },
    }, NOW)).toThrow(expect.objectContaining({ code: "SOLD_OUT" }));
  });

  it("enforces at most 3 toppings", () => {
    const four = () => resolveLine(kiosk, {
      itemId: "margherita",
      selections: { size: ["regular"], dough: ["original"], toppings: ["bacon", "olive", "corn", "jalapeno"] },
    }, NOW);
    expect(four).toThrow(CommandError);
    expect(four).toThrow(expect.objectContaining({ code: "BAD_REQUEST" }));
  });

  it("asks for a size when none is given", () => {
    expect(() => resolveLine(kiosk, { itemId: "cola" }, NOW)).toThrow(expect.objectContaining({ code: "NEEDS_CHOICE" }));
  });
});
