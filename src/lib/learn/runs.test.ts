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
      // The theme park and snack bar runs never used `record`, so they have no note milestones and their counters stay at 0.
      if (data.runId === "themepark" || data.runId === "bunsik") {
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

  it("each card picture is a part of its recorded screenshot, small enough to show at about its recorded size (I-198)", () => {
    for (const { data, cover } of LEARN_RUNS) {
      const shot = data.turns[cover.n - 1];
      const { x, y, w, h } = cover.crop;
      expect(x >= 0 && y >= 0 && x + w <= shot.width && y + h <= shot.height, data.runId).toBe(true);
      // A card is at least about 440 px wide on a laptop; a crop this narrow draws at ≥ 0.9× the screenshot.
      expect(w, data.runId).toBeLessThanOrEqual(490);
    }
  });

  it("Doughhouse and the snack bar have an order button, and it opens their live demo kiosk (I-405)", () => {
    expect(learnRun("doughhouse")?.demoKioskId).toBe("doughhouse");
    expect(learnRun("bunsik")?.demoKioskId).toBe("bunsik");
    expect(learnRun("bunsik")?.noDemoReason).toBeUndefined();
    for (const id of ["themepark", "airport-shop"]) {
      expect(learnRun(id)?.demoKioskId).toBeNull();
      expect(learnRun(id)?.noDemoReason).toBeTruthy();
    }
    expect(learnRun("nope")).toBeUndefined();
  });

  it("the round 4 fresh run comes first, Doughhouse last; every blind run has unsafe = 0 under grader v2", () => {
    expect(LEARN_RUNS.map((r) => r.data.runId)).toEqual(["bunsik", "themepark", "airport-shop", "doughhouse"]);
    expect(learnRun("bunsik")?.data.grade.orders).toMatchObject({ correct: 10, unsafe: 0, total: 10, linesChecked: 10, skillTotalDiffers: 0 });
    expect(learnRun("bunsik")?.data.grade.ordersSource).toMatch(/bk9-bunsik\/final\/grade-v2\.json$/);
    expect(learnRun("bunsik")?.data.minutes).toBe(9.6);
    expect(learnRun("themepark")?.data.grade.orders).toMatchObject({ correct: 10, unsafe: 0, total: 10, linesChecked: 10, skillTotalDiffers: 4 });
    expect(learnRun("themepark")?.data.grade.ordersSource).toMatch(/bk6-themepark\/final\/grade-v2\.json$/);
    expect(learnRun("airport-shop")?.data.grade.orders).toMatchObject({ correct: 10, unsafe: 0, total: 10, skillTotalDiffers: 0 });
  });
});
