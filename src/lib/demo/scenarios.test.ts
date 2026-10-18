import { describe, expect, it } from "vitest";
import { allKioskIds, findItem, getKiosk, groupsFor } from "@/lib/adapters/catalog";
import { newSession } from "@/lib/commands/session";
import type { CartLine, Session } from "@/types/session";
import { scenarioProgress, scenariosFor, stepDone, type Scenario } from "./scenarios";

const all = (): Scenario[] => allKioskIds().flatMap((id) => scenariosFor(id));

function session(over: Partial<Session> = {}): Session {
  return { ...newSession({ sessionId: "s".repeat(16), kioskId: "malo", demo: true, now: 0 }), status: "ordering", ...over };
}

function line(over: Partial<CartLine>): CartLine {
  return { lineId: "l1", itemId: "cola", variant: "single", qty: 1, selections: {}, unitPrice: 1800, ...over };
}

describe("scenariosFor", () => {
  it("has the nine scenarios on their kiosks", () => {
    expect(scenariosFor("malo").map((s) => s.id)).toEqual([
      "sunja-lunch",
      "not-sure",
      "sold-out",
      "halal",
      "ai-cannot-pay",
      "undo",
    ]);
    expect(scenariosFor("airport_rail").map((s) => s.id)).toEqual(["mei-tickets", "which-platform"]);
    expect(scenariosFor("doughhouse").map((s) => s.id)).toEqual(["learned-pizza"]);
    expect(scenariosFor("bunsik").map((s) => s.id)).toEqual(["learned-snack-bar"]);
    expect(scenariosFor("nope")).toEqual([]);
  });

  it("ids are unique and each scenario names its own kiosk", () => {
    const ids = all().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of allKioskIds()) for (const s of scenariosFor(id)) expect(s.kioskId).toBe(id);
  });

  it("names only items, variants, groups and options from the kiosk's data", () => {
    for (const s of all()) {
      const kiosk = getKiosk(s.kioskId);
      for (const step of s.steps) {
        const c = step.done;
        if (c.kind !== "cartHas") continue;
        const item = findItem(kiosk, c.itemId);
        expect(item, `${s.id}: ${c.itemId}`).toBeDefined();
        if (!item) continue;
        const variant = item.variants.find((v) => v.variant === (c.variant ?? item.variants[0].variant));
        expect(variant, `${s.id}: ${c.itemId} ${c.variant}`).toBeDefined();
        if (!variant) continue;
        const groups = groupsFor(item, variant.variant);
        for (const [groupId, optionIds] of Object.entries(c.selections ?? {})) {
          const group = groups.find((g) => g.groupId === groupId);
          expect(group, `${s.id}: ${c.itemId} group ${groupId}`).toBeDefined();
          for (const o of optionIds) expect(group?.options.map((x) => x.optionId), `${s.id}: ${groupId} ${o}`).toContain(o);
        }
      }
    }
  });

  it("every text has Korean and English, and every scenario has steps", () => {
    for (const s of all()) {
      expect(s.steps.length, s.id).toBeGreaterThan(0);
      const texts = [s.persona, s.title, s.goal, ...s.steps.flatMap((st) => [st.say, st.watch])];
      for (const t of texts) {
        expect(t.ko, s.id).toMatch(/[가-힣]/);
        expect(t.en.trim(), s.id).not.toBe("");
        expect(t.en, s.id).not.toMatch(/[가-힣]/);
      }
    }
  });

  it("every scenario stops before payment: no step waits for paying or paid", () => {
    for (const s of all()) {
      expect(s.stopBeforePay).toBe(true);
      for (const st of s.steps) {
        if (st.done.kind === "status") expect(["paying", "paid"], s.id).not.toContain(st.done.status);
      }
    }
  });

  it("the safety scenario waits for the confirm card, never for payment", () => {
    const pay = scenariosFor("malo").find((s) => s.id === "ai-cannot-pay");
    expect(pay?.steps.at(-1)?.done).toEqual({ kind: "status", status: "confirming" });
  });
});

describe("stepDone", () => {
  const hero = [
    line({ lineId: "a", itemId: "cheese_burger", variant: "set", selections: { side: ["fries_l"], drink: ["zero_cola"], ingredients: ["no_pickles"] } }),
    line({ lineId: "b", itemId: "cheese_burger", variant: "set", selections: { side: ["fries_l"], drink: ["cider"] } }),
  ];

  it("cartHas matches item, variant and the listed groups (any order), ignoring other groups", () => {
    const s = session({ cart: hero });
    expect(stepDone(s, { kind: "cartHas", itemId: "cheese_burger" })).toBe(true);
    expect(stepDone(s, { kind: "cartHas", itemId: "cheese_burger", variant: "set" })).toBe(true);
    expect(stepDone(s, { kind: "cartHas", itemId: "cheese_burger", variant: "single" })).toBe(false);
    expect(stepDone(s, { kind: "cartHas", itemId: "cola" })).toBe(false);
    expect(stepDone(s, { kind: "cartHas", itemId: "cheese_burger", selections: { drink: ["cider"] } })).toBe(true);
    expect(stepDone(s, { kind: "cartHas", itemId: "cheese_burger", selections: { drink: ["cola"] } })).toBe(false);
    // A listed group with no selection on the line does not match.
    expect(stepDone(s, { kind: "cartHas", itemId: "cheese_burger", selections: { drink: ["cider"], ingredients: ["no_pickles"] } })).toBe(false);
  });

  it("cartHas compares a set of options, not their order", () => {
    const s = session({ cart: [line({ itemId: "double_cheese_burger", selections: { ingredients: ["no_onion", "extra_cheese"] } })] });
    expect(stepDone(s, { kind: "cartHas", itemId: "double_cheese_burger", selections: { ingredients: ["extra_cheese", "no_onion"] } })).toBe(true);
    expect(stepDone(s, { kind: "cartHas", itemId: "double_cheese_burger", selections: { ingredients: ["extra_cheese"] } })).toBe(false);
  });

  it("cartHas qty is the total over every matching line", () => {
    const s = session({ cart: hero });
    expect(stepDone(s, { kind: "cartHas", itemId: "cheese_burger", variant: "set", qty: 2 })).toBe(true);
    expect(stepDone(s, { kind: "cartHas", itemId: "cheese_burger", variant: "set", qty: 1 })).toBe(false);
    expect(stepDone(s, { kind: "cartHas", itemId: "cheese_burger", selections: { side: ["fries_l"] }, qty: 2 })).toBe(true);
    const oneLarge = session({ cart: [hero[0], { ...hero[1], selections: { side: ["fries_m"], drink: ["cider"] } }] });
    expect(stepDone(oneLarge, { kind: "cartHas", itemId: "cheese_burger", selections: { side: ["fries_l"] }, qty: 2 })).toBe(false);
    const tickets = session({ cart: [line({ itemId: "express_city_center", qty: 2, selections: { passenger: ["adult"] } })] });
    expect(stepDone(tickets, { kind: "cartHas", itemId: "express_city_center", selections: { passenger: ["adult"] }, qty: 2 })).toBe(true);
  });

  it("cartLines and cartEmpty", () => {
    expect(stepDone(session({ cart: hero }), { kind: "cartLines", count: 2 })).toBe(true);
    expect(stepDone(session({ cart: hero }), { kind: "cartLines", count: 1 })).toBe(false);
    expect(stepDone(session(), { kind: "cartEmpty" })).toBe(true);
    expect(stepDone(session({ cart: hero }), { kind: "cartEmpty" })).toBe(false);
  });

  it("choicesOffered matches the pending question's template", () => {
    const s = session({ pendingChoice: { templateId: "pick_item", choices: [{ kind: "item", id: "cheese_burger" }] } });
    expect(stepDone(s, { kind: "choicesOffered", templateId: "pick_item" })).toBe(true);
    expect(stepDone(s, { kind: "choicesOffered", templateId: "alternatives" })).toBe(false);
    expect(stepDone(session(), { kind: "choicesOffered", templateId: "pick_item" })).toBe(false);
  });

  it("staffCalled and status", () => {
    expect(stepDone(session(), { kind: "staffCalled" })).toBe(false);
    expect(stepDone(session({ staffCalled: { reasonCode: "unknown_info", at: 1 } }), { kind: "staffCalled" })).toBe(true);
    expect(stepDone(session({ status: "confirming" }), { kind: "status", status: "confirming" })).toBe(true);
    expect(stepDone(session({ status: "paying" }), { kind: "status", status: "confirming" })).toBe(false);
  });
});

describe("scenarioProgress", () => {
  const undo = scenariosFor("malo").find((s) => s.id === "undo")!;
  const lunch = scenariosFor("malo").find((s) => s.id === "sunja-lunch")!;
  const cola = line({ itemId: "cola", selections: { size: ["m"] } });

  it("does not skip ahead: a later check that already holds does not count before the earlier ones", () => {
    // The undo scenario ends on an empty cart, which is also how it starts.
    expect(scenarioProgress(session(), undo)).toEqual({ doneSteps: 0, nextIndex: 0 });
    // Confirming with a cart that never had the hero order does not count the checkout step.
    expect(scenarioProgress(session({ status: "confirming", cart: [cola] }), lunch)).toEqual({ doneSteps: 0, nextIndex: 0 });
  });

  it("counts steps in order and keeps the steps already done", () => {
    const added = session({ cart: [cola] });
    const p1 = scenarioProgress(added, undo);
    expect(p1).toEqual({ doneSteps: 1, nextIndex: 1 });
    // After the undo the first check no longer holds, but it was done.
    expect(scenarioProgress(session(), undo, p1.doneSteps)).toEqual({ doneSteps: 2, nextIndex: 2 });
    expect(scenarioProgress(session(), undo)).toEqual({ doneSteps: 0, nextIndex: 0 });
  });

  it("walks the hero order to the confirm card", () => {
    const sets = [
      line({ lineId: "a", itemId: "cheese_burger", variant: "set", selections: { side: ["fries_m"], drink: ["zero_cola"], ingredients: ["no_pickles"] } }),
      line({ lineId: "b", itemId: "cheese_burger", variant: "set", selections: { side: ["fries_m"], drink: ["cider"] } }),
    ];
    const large = sets.map((l) => ({ ...l, selections: { ...l.selections, side: ["fries_l"] } }));
    expect(scenarioProgress(session({ cart: sets }), lunch).doneSteps).toBe(1);
    expect(scenarioProgress(session({ cart: large }), lunch).doneSteps).toBe(2);
    expect(scenarioProgress(session({ cart: large, status: "confirming" }), lunch)).toEqual({
      doneSteps: lunch.steps.length,
      nextIndex: lunch.steps.length,
    });
  });

  it("clamps the steps already done to the scenario", () => {
    expect(scenarioProgress(session(), undo, 99).doneSteps).toBe(undo.steps.length);
    expect(scenarioProgress(session(), undo, -1).doneSteps).toBe(0);
  });
});
