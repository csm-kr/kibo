import { describe, expect, it } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import type { MenuItem } from "@/types/menu";
import type { CartLine } from "@/types/session";
import { formatWon, lineLabel, sheetPrice, sheetSteps } from "./menu";

const k = getKiosk("malo");
const item = (id: string): MenuItem => k.items.find((i) => i.itemId === id)!;

function line(over: Partial<CartLine>): CartLine {
  return { lineId: "l1", itemId: "cheese_burger", variant: "single", qty: 1, selections: {}, unitPrice: 0, ...over };
}

describe("formatWon", () => {
  it("adds thousands separators and the won suffix", () => {
    expect(formatWon(4900)).toBe("4,900원");
    expect(formatWon(0)).toBe("0원");
    expect(formatWon(1234567)).toBe("1,234,567원");
  });
});

describe("lineLabel", () => {
  it("adds the variant word for items with several variants", () => {
    expect(lineLabel(k, line({ variant: "set" }), "ko").title).toBe("치즈버거 세트");
    expect(lineLabel(k, line({ variant: "single" }), "ko").title).toBe("치즈버거 단품");
    expect(lineLabel(k, line({ variant: "largeSet" }), "ko").title).toBe("치즈버거 라지 세트");
    expect(lineLabel(k, line({ variant: "set" }), "en").title).toBe("Cheeseburger set");
  });

  it("leaves the variant word out for single-variant items", () => {
    expect(lineLabel(k, line({ itemId: "cola", selections: { size: ["m"] } }), "ko")).toEqual({
      title: "콜라",
      detail: "M",
    });
  });

  it("lists chosen options in group order, then menu order, whatever order they were given in", () => {
    const l = line({
      variant: "set",
      selections: { ingredients: ["extra_cheese", "no_pickles"], drink: ["zero_cola"], side: ["fries_m"] },
    });
    expect(lineLabel(k, l, "ko").detail).toBe("감자튀김 M · 제로콜라 · 피클 빼기 · 치즈 추가");
  });

  it("has an empty detail when nothing was chosen", () => {
    expect(lineLabel(k, line({ itemId: "soft_cone" }), "ko")).toEqual({ title: "소프트콘", detail: "" });
  });
});

describe("sheetSteps", () => {
  it("burger before a variant is chosen: variant, side, drink, ingredients", () => {
    const steps = sheetSteps(item("cheese_burger"), null, "ko");
    expect(steps.map((s) => [s.kind, s.groupId])).toEqual([
      ["variant", undefined],
      ["group", "side"],
      ["group", "drink"],
      ["group", "ingredients"],
    ]);
    expect(steps.map((s) => [s.index, s.count])).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ]);
    expect(steps[1].label).toBe("사이드");
  });

  it("burger single: only the groups that apply to it", () => {
    const steps = sheetSteps(item("cheese_burger"), "single", "ko");
    expect(steps.map((s) => s.groupId ?? s.kind)).toEqual(["variant", "ingredients"]);
    expect(steps[1]).toMatchObject({ index: 2, count: 2 });
  });

  it("single-variant item with a group skips the variant step", () => {
    const steps = sheetSteps(item("chicken_nuggets"), "single", "ko");
    expect(steps).toEqual([{ kind: "group", groupId: "sauce", label: "소스", index: 1, count: 1 }]);
  });

  it("item without choices still has one step for the quantity", () => {
    const steps = sheetSteps(item("soft_cone"), "single", "en");
    expect(steps).toEqual([{ kind: "qty", label: "Quantity", index: 1, count: 1 }]);
  });
});

describe("sheetPrice", () => {
  it("variant price plus option deltas, times quantity", () => {
    const draft = {
      itemId: "cheese_burger",
      variant: "set" as const,
      qty: 2,
      selections: { side: ["fries_l"], drink: ["iced_coffee"], ingredients: ["extra_patty"] },
    };
    // (6900 + 500 + 500 + 1500) * 2
    expect(sheetPrice(k, draft)).toBe(18800);
  });

  it("ignores groups that do not apply to the chosen variant", () => {
    const draft = { itemId: "cheese_burger", variant: "single" as const, qty: 1, selections: { side: ["fries_l"] } };
    expect(sheetPrice(k, draft)).toBe(4900);
  });

  it("uses the first variant's price before a variant is chosen", () => {
    expect(sheetPrice(k, { itemId: "cheese_burger", variant: null, qty: 1, selections: {} })).toBe(4900);
  });
});
