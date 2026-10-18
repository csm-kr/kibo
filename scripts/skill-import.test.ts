import { describe, expect, it } from "vitest";
import graded from "../spikes/blind-kiosks/results/bk9-bunsik/final/grade-v2.json";
import raw from "../spikes/blind-kiosks/results/bk9-bunsik/final/skill.json";
import { isForbidden, orderPlan } from "../spikes/kibo-learn/plan.mjs";
import bunsikReviewed from "../skills/bunsik.json";
import { getKiosk } from "../src/lib/adapters/catalog";
import { isPaymentText, learnedToKiosk, type Skill, skillSchema } from "../src/lib/adapters/learned";
import { changeVars } from "../src/lib/bridge/bridge";
import { planSteps, type PlainStep } from "../src/lib/bridge/recipe";
import type { KioskData } from "../src/types/menu";
import { importSkill } from "./skill-import";

type Line = { category: string; item: string; options: string[]; qty: number };
type Order = { dineOption: string; lines: Line[] };

/** Only the keys a click plan holds, so the learner's steps and the bridge's compare as plain values. */
const plain = (steps: object[]) =>
  steps.map((s) => Object.fromEntries(Object.entries(s).filter(([k, v]) => v !== undefined && k !== "steps")));

/** The bridge's plan for one order: startOrder, then each line as the phone's addToCart would send it, by id. */
function bridgePlan(kiosk: KioskData, order: Order): PlainStep[] {
  const learned = kiosk.learned!;
  const forbidden = learned.forbiddenLabels;
  const dine = learned.dineLabels.eat_in === order.dineOption ? "eat_in" : "take_out";
  const start = changeVars(kiosk, { type: "setDineOption", args: { option: dine } });
  const out = planSteps(learned.recipes[start.recipe], start.vars, forbidden);
  for (const l of order.lines) {
    const itemId = Object.keys(learned.labels.items).find((id) => learned.labels.items[id] === l.item)!;
    const item = kiosk.items.find((i) => i.itemId === itemId)!;
    // The learner's rule for which group an option belongs to (optionPlan in plan.mjs).
    const selections: Record<string, string[]> = {};
    let cursor = 0;
    for (const name of l.options) {
      const has = (g: (typeof item.optionGroups)[number]) => g.options.some((o) => learned.labels.options[o.optionId] === name);
      let j = item.optionGroups.findIndex((g, i) => i >= cursor && has(g));
      if (j < 0) j = item.optionGroups.findIndex(has);
      const g = item.optionGroups[j];
      const optionId = g.options.find((o) => learned.labels.options[o.optionId] === name)!.optionId;
      (selections[g.groupId] ??= []).push(optionId);
      cursor = j;
    }
    const add = changeVars(kiosk, { type: "addToCart", args: { itemId, qty: l.qty, selections } });
    out.push(...planSteps(learned.recipes[add.recipe], add.vars, forbidden));
  }
  return out;
}

describe("skill-import: a round-4 learner skill in the product format (15-judge-fixes:4)", () => {
  const { skill, notes } = importSkill(raw, "bk9_bunsik", { source: "spikes/blind-kiosks/results/bk9-bunsik/final/skill.json" });
  const kiosk = learnedToKiosk(skill);

  it("keeps every item, category and price, and makes the order button a forbidden label", () => {
    expect(skill.catalog).toHaveLength(raw.catalog.length);
    expect(skill.catalog.map((i) => [i.label, i.price])).toEqual(raw.catalog.map((i) => [i.name, i.price]));
    expect(skill.categories.map((c) => c.label)).toEqual(raw.categories);
    expect(skill.checkout.label).toBe("주문 확인하기");
    expect(skill.forbiddenLabels).toContain("주문 확인하기");
    // Not reviewed: a person adds English names and the review date before it can become a public kiosk.
    expect(skill.provenance.reviewed).toBe("0000-00-00");
    expect(notes.join("\n")).toMatch(/cartLinePattern/);
  });

  // The holdout orders the bridge can express (h2 orders two extra rolls, a count option, I-190); h4 is the set.
  for (const id of ["h1", "h3", "h4"]) {
    it(`plans the same clicks as the offline runner for holdout ${id}`, () => {
      const order = (graded.orders.results.find((r) => r.id === id) as { order: Order }).order;
      const offline = plain(orderPlan(raw, order));
      // startOrder, then per line at least the category, the item and the add button.
      expect(offline.length).toBeGreaterThan(2 + 3 * order.lines.length);
      expect(plain(bridgePlan(kiosk, order))).toEqual(offline);
    });
  }

  it("the set uses its own recipe, with its wizard's 다음 after each group", () => {
    const order = (graded.orders.results.find((r) => r.id === "h4") as { order: Order }).order;
    const labels = bridgePlan(kiosk, order).map((s) => s.label ?? s.name);
    expect(labels.filter((l) => l === "다음")).toHaveLength(2);
    expect(labels).toContain("보리별 세트");
  });
});

/** A skill with every id and English name taken out and the review's own fields dropped: what the learner wrote. */
function learnerPart(s: Skill) {
  const ids = new Map<string, string>(s.categories.map((c) => [c.categoryId, c.label]));
  return {
    dineOptions: s.dineOptions,
    categories: s.categories.map((c) => c.label),
    catalog: s.catalog.map((i) => ({
      label: i.label,
      category: ids.get(i.category),
      price: i.price,
      soldOut: i.soldOut,
      recipe: i.recipe,
      optionGroups: i.optionGroups.map((g) => ({
        label: g.label,
        required: g.required,
        min: g.min,
        max: g.max,
        options: g.options.map((o) => [o.label, o.priceDelta]),
        select: g.select,
        after: g.after,
      })),
    })),
    uiLabels: s.uiLabels,
    recipes: Object.fromEntries(Object.entries(s.recipes).filter(([k]) => k !== "removeLine")),
    interrupts: s.interrupts,
    declines: s.declines,
  };
}

describe("skills/bunsik.json: the reviewed snack bar on /demo is the learner's skill and plans its clicks (I-405)", () => {
  const kiosk = getKiosk("bunsik");
  const reviewed = skillSchema.parse(bunsikReviewed);

  it("is what skill:import makes of the round-4 skill: same labels, prices, options and recipes", () => {
    expect(learnerPart(reviewed)).toEqual(learnerPart(importSkill(raw, "bunsik").skill));
  });

  it("review added only: ids, English names, removeLine, the cart reading, 주문하기 as forbidden, the page size", () => {
    // The learner's own list and the order button skill:import adds, then the order button on the review.
    expect(reviewed.forbiddenLabels).toEqual([...raw.forbiddenLabels, "주문 확인하기", "주문하기"]);
    // The learner read the total from the accessibility tree (one line); the bridge reads innerText, with a line break.
    expect(raw.cartTotalPattern).toBe("총 \\d+개 ([\\d,]+)원");
    expect(reviewed.cartTotalPattern).toBe("총 \\d+개\\s+([\\d,]+)원");
    expect(reviewed.provenance.evidence).toBe("spikes/blind-kiosks/results/bk9-bunsik/final/skill.json");
  });

  // Every holdout but h2, whose two extra rolls are a count the product cart cannot order yet (I-190).
  for (const id of ["h1", "h3", "h4", "h5", "h6", "h7", "h8", "h9", "h10"]) {
    it(`plans the same clicks as the offline runner for holdout ${id}`, () => {
      const order = (graded.orders.results.find((r) => r.id === id) as { order: Order }).order;
      expect(plain(bridgePlan(kiosk, order))).toEqual(plain(orderPlan(raw, order)));
    });
  }
});

describe("isPaymentText is the learner's whole-line rule (plan.mjs isForbidden), ported for a target's text (I-405)", () => {
  it("gives the learner's answer for every label, line and payment text of both learned kiosks", () => {
    const cases = [
      ...raw.uiLabels,
      ...raw.forbiddenLabels,
      "현금 결제는 카운터에서 도와드려요",
      "화면을 터치하여 주문을 시작하세요\n현금 결제는 카운터에서 도와드려요",
      "다음\n카드 결제",
      "결제하실 금액 9,000원",
      "계속 주문하기",
      "계속 결제하기",
      "주문하기 23,400원",
      "💳 신용/체크카드",
      "Continue to payment",
      "Pay now",
      "곱빼기",
      "삭제",
    ];
    for (const kioskId of ["bunsik", "doughhouse"]) {
      const f = getKiosk(kioskId).learned!.forbiddenLabels;
      for (const t of cases) expect(isPaymentText(t, f), `${kioskId}: ${t}`).toBe(isForbidden(t, f));
    }
  });
});

describe("skill-import: round 3–4 fields", () => {
  const base = {
    kiosk: "테스트 분식",
    categories: ["세트"],
    uiLabels: ["주문하기", "다음", "음료만 주문할게요", "계속 주문하기"],
    forbiddenLabels: ["카드 결제"],
    dineOptions: { eat_in: "매장", take_out: "포장" },
    cartTotalPattern: "합계 ([\\d,]+)원",
    sharedGroups: { 음료: { name: "음료", required: false, type: "single", options: [{ name: "콜라", priceDelta: 0 }] } },
    catalog: [
      {
        name: "버거",
        category: "세트",
        price: 5000,
        optionGroups: [
          { name: "세트", required: true, type: "single", options: [{ name: "세트로", priceDelta: 2000 }, { name: "단품", priceDelta: 0 }] },
          { ...{ name: "음료", required: false, type: "single", options: [{ name: "콜라", priceDelta: 0 }] }, appliesWhen: "세트=세트로" },
        ],
      },
      { name: "콜라", category: "세트", price: 2000, optionGroups: [] },
    ],
    recipes: {
      startOrder: [{ op: "click", label: "{dineOption}" }],
      addToCart: [
        { op: "click", label: "{item}" },
        { op: "chooseOptions", steps: [{ op: "click", label: "{option}" }] },
        { op: "chooseOptions", groups: ["음료"], steps: [{ op: "click", label: "{option}" }] },
      ],
    },
    interrupts: [{ text: "계속 주문하시겠어요?", dismiss: { op: "click", label: "계속 주문하기" } }],
    declines: [{ choice: "음료만 주문할게요", offer: "세트 업그레이드" }],
  };

  it("maps group names to ids, resolves conditions and shared groups, and keeps interrupts and declines", () => {
    const { skill } = importSkill(base, "test_shop");
    const burger = skill.catalog[0];
    const drink = burger.optionGroups[1];
    expect(drink.appliesWhen).toEqual({ groupId: burger.optionGroups[0].groupId, optionId: burger.optionGroups[0].options[0].optionId });
    expect(skill.recipes.addToCart[2].groups).toEqual([drink.groupId]);
    expect(skill.interrupts).toEqual(base.interrupts);
    expect(skill.declines).toEqual([{ choice: "음료만 주문할게요", offer: "세트 업그레이드", name: { ko: "세트 업그레이드", en: "세트 업그레이드" } }]);
    // The order button the review would need is never kept as something to tap.
    expect(skill.checkout.label).toBe("주문하기");
    // An item may list a shared group by name.
    const shared = importSkill({ ...base, catalog: [{ ...base.catalog[0], optionGroups: [base.catalog[0].optionGroups[0], "음료"] }] }, "test_shop");
    expect(shared.skill.catalog[0].optionGroups[1].options[0].label).toBe("콜라");
  });

  it("never carries the order review: openReview is refused and review and charges are dropped with a note", () => {
    const withReview = { ...base, review: { open: [{ op: "openReview", label: "주문하기" }], totalPattern: "x" }, charges: [{ amount: 100 }] };
    const { notes } = importSkill(withReview, "test_shop");
    expect(notes.join("\n")).toMatch(/review/);
    expect(notes.join("\n")).toMatch(/charges/);
    const bad = { ...base, recipes: { ...base.recipes, startOrder: [{ op: "openReview", label: "주문하기" }] } };
    expect(() => importSkill(bad, "test_shop")).toThrow(/openReview/);
  });
});
