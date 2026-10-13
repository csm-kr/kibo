import { describe, expect, it } from "vitest";
import template from "../../../evidence/human-runs.template.json";
import { buildComparison, HERO_CART, median, parseHumanRuns, parseTouchRun, sameOrder, type TouchRun } from "./compare";

const live = { sentences: 3, phoneTaps: 5, kioskTaps: 0, seconds: 48 };
const automated: TouchRun = { date: "2026-10-13T01:00:00.000Z", taps: 19, seconds: 2, total: 14800, cart: HERO_CART, note: "automated" };
const line = (itemId: string, selections: Record<string, string[]>, qty = 1) => ({ itemId, variant: "set" as const, qty, selections });

describe("sameOrder", () => {
  it("matches the hero cart in any line order and option order", () => {
    const cart = [
      line("cheese_burger", { drink: ["cider"], side: ["fries_l"] }),
      line("cheese_burger", { side: ["fries_l"], drink: ["zero_cola"], ingredients: ["no_pickles"] }),
    ];
    expect(sameOrder(cart)).toBe(true);
  });

  it("ignores empty groups and counts a qty 2 line as two lines", () => {
    const twice = [line("cheese_burger", { side: ["fries_l"], drink: ["cider"], ingredients: [] }, 2)];
    const hero = [line("cheese_burger", { side: ["fries_l"], drink: ["cider"] }), line("cheese_burger", { side: ["fries_l"], drink: ["cider"] })];
    expect(sameOrder(twice, hero)).toBe(true);
  });

  it("does not match when an option, the variant or the count differs", () => {
    const mediumFries = [
      line("cheese_burger", { side: ["fries_m"], drink: ["zero_cola"], ingredients: ["no_pickles"] }),
      line("cheese_burger", { side: ["fries_l"], drink: ["cider"] }),
    ];
    expect(sameOrder(mediumFries)).toBe(false);
    expect(sameOrder(HERO_CART.map((l) => ({ ...l, variant: "largeSet" as const })))).toBe(false);
    expect(sameOrder(HERO_CART.slice(0, 1))).toBe(false);
    expect(sameOrder([])).toBe(false);
  });
});

describe("median", () => {
  it("takes the middle value, or the mean of the two middle ones", () => {
    expect(median([30, 10, 20])).toBe(20);
    expect(median([10, 20, 30, 40])).toBe(25);
  });
});

describe("parse evidence", () => {
  it("accepts the automated run's fields and refuses anything else", () => {
    expect(parseTouchRun(automated)).toEqual(automated);
    expect(parseTouchRun({ taps: 19 })).toBeNull();
    expect(parseTouchRun(undefined)).toBeNull();
  });

  it("needs at least one human touch run with positive numbers", () => {
    const runs = { touch: [{ date: "2026-10-16", person: "A", taps: 20, seconds: 90 }], voice: [] };
    expect(parseHumanRuns(runs)?.touch).toHaveLength(1);
    expect(parseHumanRuns({ touch: [], voice: [] })).toBeNull();
    expect(parseHumanRuns({ touch: [{ date: "", person: "A", taps: 0, seconds: 0 }], voice: [] })).toBeNull();
    expect(parseHumanRuns(undefined)).toBeNull();
    // A copy of the template that was never filled in shows nothing.
    expect(parseHumanRuns(template)).toBeNull();
  });
});

describe("buildComparison", () => {
  it("keeps this session's live counts as they are", () => {
    expect(buildComparison({ live, cart: HERO_CART, automated, human: null }).live).toEqual(live);
  });

  it("uses the automated run when no human runs exist, marked as the same order when the cart matches", () => {
    const c = buildComparison({ live, cart: HERO_CART, automated, human: null, editPathTaps: 41 });
    expect(c.touch).toEqual({ source: "automated", taps: 19, date: automated.date, sameOrder: true, editPathTaps: 41 });
  });

  it("says the touch numbers are for the reference order when the judge's cart differs", () => {
    const c = buildComparison({ live, cart: [line("cheese_burger", { side: ["fries_m"], drink: ["cola"] })], automated, human: null });
    expect(c.touch).toMatchObject({ source: "automated", sameOrder: false, editPathTaps: null });
  });

  it("prefers the medians of human runs when the file exists", () => {
    const human = {
      touch: [
        { date: "d", person: "A", taps: 21, seconds: 95 },
        { date: "d", person: "B", taps: 19, seconds: 80 },
        { date: "d", person: "C", taps: 25, seconds: 120 },
      ],
      voice: [],
    };
    const c = buildComparison({ live, cart: HERO_CART, automated, human });
    expect(c.touch).toEqual({ source: "human", runs: 3, taps: 21, seconds: 95, sameOrder: true });
  });

  it("hides the touch column when there is no evidence", () => {
    expect(buildComparison({ live, cart: HERO_CART, automated: null, human: null }).touch).toBeNull();
  });
});
