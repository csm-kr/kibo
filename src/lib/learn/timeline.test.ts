import { describe, expect, it } from "vitest";
import { buildTimeline, describeCall, formatClock, type LearnTurn } from "./timeline";

const none = { items: 0, optionGroups: 0, categories: 0 };

function turn(n: number, tool: string, result: string, discoveries = none, args: LearnTurn["calls"][number]["args"] = {}): LearnTurn {
  return {
    n,
    at: new Date(Date.UTC(2026, 9, 13, 21, 0, n)).toISOString(),
    calls: [{ tool, args, result }],
    discoveries,
    image: `turn-${n}.webp`,
    width: 720,
    height: 1067,
  };
}

const START = new Date(Date.UTC(2026, 9, 13, 21, 0, 0)).toISOString();

describe("describeCall", () => {
  it("says what was tapped, in order, with each Korean label's English gloss", () => {
    expect(describeCall({ tool: "act", args: {}, result: "tapped 데워 주세요 → 담기" })).toEqual({
      text: "Tapped 데워 주세요 (Heat it, please) → 담기 (Add)",
      outcome: "ok",
    });
  });

  it("names a refused payment button without the learner's machine text", () => {
    const r = describeCall({
      tool: "act",
      args: {},
      result: 'act failed: Refused: "주문하기" is a payment or checkout control; a skill never needs it (list it in forbiddenLabels)',
    });
    expect(r).toEqual({ text: "Refused to tap 주문하기 (Order): it is a payment or checkout button", outcome: "refused" });
  });

  it("explains an ambiguous label instead of showing the JSON", () => {
    const r = describeCall({
      tool: "act",
      args: {},
      result: 'act failed: {"role":"button","name":"담기","op":"click"} matches 4 elements; add "within": "<text near the one you mean>" or "exact": true',
    });
    expect(r).toEqual({ text: "Did not tap: “담기 (Add)” matches 4 buttons on this screen", outcome: "failed" });
  });

  it("counts the names written down and the self-test result", () => {
    expect(describeCall({ tool: "record", args: { kind: "item", names: ["a", "b"] }, result: "recorded item a, b" }).text).toBe(
      "Wrote down 2 items: a, b",
    );
    expect(describeCall({ tool: "record", args: { kind: "item", names: ["김밥", "콜라"] }, result: "recorded item 김밥, 콜라" }).text).toBe(
      "Wrote down 2 items: 김밥 (Kimbap), 콜라 (Cola)",
    );
    expect(describeCall({ tool: "record", args: { kind: "flow" }, result: "recorded a flow fact" }).text).toBe(
      "Wrote down a note about the order flow",
    );
    expect(describeCall({ tool: "testSkill", args: {}, result: "testSkill 3/3 passed" })).toEqual({
      text: "Self-test without AI: 3 of 3 orders passed",
      outcome: "ok",
    });
    expect(describeCall({ tool: "testSkill", args: {}, result: "testSkill 2/3 passed" }).outcome).toBe("failed");
    expect(describeCall({ tool: "finish", args: {}, result: "finish rejected" })).toEqual({
      text: "Asked to finish: refused by the finish gate",
      outcome: "failed",
    });
  });

  it("keeps an unknown result as it was recorded", () => {
    expect(describeCall({ tool: "newTool", args: {}, result: "did something" }).text).toBe("newTool: did something");
  });
});

describe("buildTimeline", () => {
  const turns = [
    turn(1, "act", "tapped 시작"),
    turn(2, "record", "recorded item 김밥, 라면", { items: 2, optionGroups: 1, categories: 1 }, { kind: "item", names: ["김밥", "라면"] }),
    turn(3, "act", "tapped 음료", { items: 2, optionGroups: 1, categories: 1 }),
    turn(4, "record", "recorded item 콜라", { items: 3, optionGroups: 1, categories: 2 }, { kind: "item", names: ["콜라"] }),
    turn(5, "testSkill", "testSkill 2/3 passed", { items: 3, optionGroups: 1, categories: 2 }),
    turn(6, "audit", "audit ok", { items: 3, optionGroups: 1, categories: 2 }),
    turn(7, "testSkill", "testSkill 3/3 passed", { items: 3, optionGroups: 1, categories: 2 }),
    turn(8, "finish", "finish accepted", { items: 3, optionGroups: 1, categories: 2 }),
  ];
  const t = buildTimeline({ startedAt: START, turns });

  it("keeps every recorded turn, in order, with nothing added", () => {
    expect(t.steps.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(t.steps[0].elapsedMs).toBe(1000);
    expect(t.steps[0].image).toBe("turn-1.webp");
  });

  it("carries the counters and the latest names written down", () => {
    expect(t.steps[0].known).toEqual(none);
    expect(t.steps[0].latest).toBeNull();
    expect(t.steps[2].known).toEqual({ items: 2, optionGroups: 1, categories: 1 });
    expect(t.steps[2].latest).toEqual({ n: 2, names: ["김밥", "라면"] });
    expect(t.steps[3].latest).toEqual({ n: 4, names: ["콜라"] });
    expect(t.steps[7].latest).toEqual({ n: 4, names: ["콜라"] });
  });

  it("marks the milestones at the turns where they happened", () => {
    expect(t.milestones.map((m) => [m.kind, m.n, m.label])).toEqual([
      ["first-item", 2, "First items written down"],
      ["all-categories", 4, "All 2 categories written down"],
      ["audit", 6, "Coverage audit passed"],
      ["self-test", 7, "Self-test 3/3 passed"],
      ["finish", 8, "Finished"],
    ]);
    expect(t.milestones.find((m) => m.kind === "finish")?.index).toBe(7);
  });

  it("leaves out a milestone that never happened", () => {
    const short = buildTimeline({ startedAt: START, turns: turns.slice(0, 3) });
    expect(short.milestones.map((m) => m.kind)).toEqual(["first-item", "all-categories"]);
    expect(buildTimeline({ startedAt: START, turns: [turn(1, "act", "tapped 시작")] }).milestones).toEqual([]);
  });
});

describe("formatClock", () => {
  it("writes minutes and seconds", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65_400)).toBe("1:05");
    expect(formatClock(8 * 60_000 + 3_000)).toBe("8:03");
  });
});
