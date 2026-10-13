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
      expect(t.milestones.at(-1)).toMatchObject({ kind: "finish", index: data.turnCount - 1 });
      // The theme park run never used `record`, so it has no note milestones and its counters stay at 0.
      if (data.runId === "themepark") {
        expect(t.milestones.map((m) => m.kind).sort()).toEqual(["audit", "finish", "self-test"]);
        expect(t.steps.every((s) => s.known.items === 0 && s.known.categories === 0)).toBe(true);
      } else {
        expect(t.milestones.map((m) => m.kind).sort()).toEqual(["all-categories", "audit", "finish", "first-item", "self-test"]);
        expect(t.steps.at(-1)?.known.items).toBeGreaterThan(0);
      }
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
    for (const id of ["themepark", "airport-shop"]) {
      expect(learnRun(id)?.demoKioskId).toBeNull();
      expect(learnRun(id)?.noDemoReason).toBeTruthy();
    }
    expect(learnRun("nope")).toBeUndefined();
  });

  it("the fresh hold-out run comes first; both blind runs have unsafe = 0 under grader v2", () => {
    expect(LEARN_RUNS.map((r) => r.data.runId)).toEqual(["themepark", "airport-shop", "doughhouse"]);
    expect(learnRun("themepark")?.data.grade.orders).toMatchObject({ correct: 10, unsafe: 0, total: 10, linesChecked: 10, skillTotalDiffers: 4 });
    expect(learnRun("themepark")?.data.grade.ordersSource).toMatch(/bk6-themepark\/final\/grade-v2\.json$/);
    expect(learnRun("airport-shop")?.data.grade.orders).toMatchObject({ correct: 10, unsafe: 0, total: 10, skillTotalDiffers: 0 });
  });
});
