import { describe, expect, it } from "vitest";
import { LEARN_RUNS, learnRun } from "./runs";
import { buildTimeline } from "./timeline";

// The copied traces themselves (public/learn/*/run.json): every turn is there and each run reaches its finish.

describe("recorded learn runs", () => {
  for (const run of LEARN_RUNS) {
    const { data } = run;
    it(`${data.runId}: one step per recorded turn, ending at the accepted finish`, () => {
      const t = buildTimeline(data);
      expect(t.steps).toHaveLength(data.turnCount);
      expect(t.steps.map((s) => s.n)).toEqual(data.turns.map((_, i) => i + 1));
      expect(t.milestones.map((m) => m.kind).sort()).toEqual(["all-categories", "audit", "finish", "first-item", "self-test"]);
      expect(t.milestones.at(-1)).toMatchObject({ kind: "finish", index: data.turnCount - 1 });
      expect(t.steps.at(-1)?.known.items).toBeGreaterThan(0);
    });

    it(`${data.runId}: holds no prompt or model text, only labels and one-line results`, () => {
      for (const turn of data.turns) {
        expect(Object.keys(turn).sort()).toEqual(["at", "calls", "discoveries", "height", "image", "n", "width"]);
        for (const c of turn.calls) {
          expect(Object.keys(c.args).every((k) => ["steps", "kind", "names"].includes(k))).toBe(true);
          expect(c.result.length).toBeLessThan(400);
        }
      }
    });
  }

  it("only Doughhouse has an order button, and it opens the live demo kiosk", () => {
    expect(learnRun("doughhouse")?.demoKioskId).toBe("doughhouse");
    expect(learnRun("airport-shop")?.demoKioskId).toBeNull();
    expect(learnRun("airport-shop")?.noDemoReason).toBeTruthy();
    expect(learnRun("nope")).toBeUndefined();
  });

  it("the blind run has unsafe = 0", () => {
    expect(learnRun("airport-shop")?.data.grade.orders).toMatchObject({ correct: 10, unsafe: 0, total: 10 });
  });
});
