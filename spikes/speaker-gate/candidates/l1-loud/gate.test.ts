import { describe, expect, it } from "vitest";
import { frameDb, loudGate, type GateParams } from "./gate";

// The first block uses the bench's 32 ms Silero windows with a speech flag per frame; the second the app's 40 ms
// frames and the gate's own level test (no flag).
const FRAME_MS = 32;

type Frame = [number, boolean];
const quiet = (ms: number): Frame[] => Array.from({ length: Math.round(ms / FRAME_MS) }, () => [-80, false]);
const talk = (db: number, ms: number, speech = true): Frame[] => Array.from({ length: Math.round(ms / FRAME_MS) }, () => [db, speech]);
const P: Partial<GateParams> = { frameMs: 32, depthDb: 9 };

function run(frames: Frame[], p: Partial<GateParams> = P, enrol: Frame[] = []) {
  const g = loudGate(p);
  for (const [e, s] of enrol) g.learn(e, s);
  for (const [e, s] of frames) g.push(e, s);
  return g;
}
/** Is any segment open during [a, b) ms? */
const openIn = (segs: [number, number][], a: number, b: number) => segs.some(([s, e]) => s < b && e > a);
/** First ms in [a, b) that a segment covers, or null. */
function firstOpen(segs: [number, number][], a: number, b: number): number | null {
  const hits = segs.filter(([s, e]) => s < b && e > a).map(([s]) => Math.max(s, a));
  return hits.length ? Math.min(...hits) : null;
}

describe("loudGate", () => {
  it("cold: a 0.4 s 'Yes.' after silence opens the gate", () => {
    const g = run([...quiet(1000), ...talk(-20, 400), ...quiet(1500)]);
    expect(openIn(g.segments(), 1000, 1400)).toBe(true);
  });

  it("non-speech teaches nothing and opens nothing, however loud", () => {
    const g = run([...quiet(500), ...talk(-10, 3000, false), ...quiet(500)]);
    expect(g.level()).toBeNull();
    expect(g.segments()).toEqual([]);
  });

  it("after the customer is learned, a voice 10 dB quieter stays out (depth 9)", () => {
    const g = run([...quiet(500), ...talk(-20, 2000), ...quiet(500), ...talk(-30, 2000)]);
    expect(g.level()).toBeCloseTo(-20, 0);
    expect(openIn(g.segments(), 3300, 5000)).toBe(false);
  });

  it("warm start: the enrolment's level holds only until someone talks; a lone talker is never gated out", () => {
    // The trade (kibo-59, 11-27): a quieter voice heard alone is kept, even when the enrolment was louder, because
    // level cannot tell a quieter customer from a quieter bystander.
    const g = run([...quiet(500), ...talk(-30, 3000), ...quiet(500)], P, [...quiet(300), ...talk(-20, 2500)]);
    expect(openIn(g.segments(), 500, 3500)).toBe(true);
  });

  it("warm start: a customer 12 dB under their enrolment is kept from the start of their sentence", () => {
    const g = run([...quiet(1000), ...talk(-32, 5000), ...quiet(1000)], P, [...quiet(300), ...talk(-20, 2500)]);
    // The gate opens once 0.6 s of their speech has set the level, and reaches back to where that speech began.
    expect(firstOpen(g.segments(), 0, 6000)).toBeLessThanOrEqual(1000);
    expect(openIn(g.segments(), 5500, 6000)).toBe(true);
  });

  it("warm start: a quieter voice talking over the customer stays out", () => {
    const frames = [...quiet(500), ...talk(-20, 3000), ...talk(-30, 2000), ...quiet(500)];
    const g = run(frames, P, [...quiet(300), ...talk(-20, 2500)]);
    expect(openIn(g.segments(), 4300, 5500)).toBe(false);
  });

  it("lock-out 1: a customer 12 dB quieter than before is heard again within 10 s, without a restart", () => {
    const g = run([...quiet(500), ...talk(-20, 2000), ...talk(-32, 12000)]);
    // After the hang-over of the loud part (closes at 3200 ms).
    const t = firstOpen(g.segments(), 3300, 14500);
    expect(t).not.toBeNull();
    expect(t! - 2500).toBeLessThanOrEqual(10000);
  });

  it("lock-out 2: a 0.3 s sound 10 dB louder, even flagged as speech, does not raise the level", () => {
    const g = run([...quiet(500), ...talk(-20, 2000), ...quiet(300), ...talk(-10, 300), ...quiet(1000), ...talk(-20, 1000)]);
    expect(g.level()).toBeCloseTo(-20, 0);
    // The customer at their own level after the bang (and its hang-over) is let through at once.
    expect(firstOpen(g.segments(), 4100, 5100)).toBeLessThanOrEqual(4100 + 3 * FRAME_MS);
  });

  it("lock-out 3: a bystander 8 dB under the customer for 3 s does not pull the bar down for one 15 dB under", () => {
    // The bystander 8 dB under is inside the depth and gets through (a level gate cannot help that); what must not
    // happen is the bar sinking: after their hang-over ends (6200 ms) the one 15 dB under stays out.
    const g = run([...quiet(500), ...talk(-20, 2000), ...talk(-28, 3000), ...talk(-35, 2000)]);
    expect(openIn(g.segments(), 6300, 7500)).toBe(false);
  });

  it("a 0.3 s pause inside a sentence keeps one segment; a 1 s pause closes it with the hang-over", () => {
    const one = run([...quiet(500), ...talk(-20, 1500), ...quiet(300), ...talk(-20, 1500), ...quiet(2000)]).segments();
    expect(one.length).toBe(1);
    const two = run([...quiet(500), ...talk(-20, 1500), ...quiet(1000), ...talk(-20, 1500), ...quiet(2000)]).segments();
    expect(two.length).toBe(2);
    // Closes 0.7 s after the last near frame ends (2000 ms), opens 0.2 s before the first (pre-roll).
    expect(two[0][0]).toBeCloseTo(300, -2);
    expect(two[0][1]).toBeCloseTo(2700, -2);
  });

  it("after KIBO asks a question, a short answer 12 dB under the level gets through for a few seconds", () => {
    const base = [...quiet(500), ...talk(-20, 2000), ...quiet(1000)];
    const answer = [...talk(-32, 500), ...quiet(1000)];
    const without = run([...base, ...answer]);
    expect(openIn(without.segments(), 3500, 4000)).toBe(false);
    const g = loudGate(P);
    for (const [e, s] of base) g.push(e, s);
    g.asked();
    for (const [e, s] of answer) g.push(e, s);
    expect(openIn(g.segments(), 3500, 4000)).toBe(true);
  });

  it("streams: the segments closed after a prefix are the same as in the whole run", () => {
    const frames = [...quiet(500), ...talk(-20, 1500), ...quiet(1000), ...talk(-26, 1000), ...quiet(1200), ...talk(-20, 800), ...quiet(1500)];
    const full = run(frames).segments();
    for (const n of [40, 80, 120, 160]) {
      const prefix = run(frames.slice(0, n)).closedSegments();
      expect(full.slice(0, prefix.length)).toEqual(prefix);
    }
  });
});

describe("loudGate, 40 ms frames, its own level test (no voice detector)", () => {
  const F = 40;
  const q = (ms: number): number[] => Array.from({ length: Math.round(ms / F) }, () => -70);
  const t = (db: number, ms: number): number[] => Array.from({ length: Math.round(ms / F) }, () => db);
  const go = (levels: number[]) => {
    const g = loudGate({ frameMs: F });
    for (const e of levels) g.push(e);
    return g;
  };

  it("opens on a cold 0.4 s 'Yes.' and learns the level from a sentence", () => {
    const g = go([...q(1000), ...t(-20, 400), ...q(1000), ...t(-20, 2000), ...q(1000)]);
    expect(openIn(g.segments(), 1000, 1400)).toBe(true);
    expect(g.level()).toBeCloseTo(-20, 0);
  });

  it("keeps out a voice 10 dB under the learned level (depth 6)", () => {
    const g = go([...q(500), ...t(-20, 2000), ...q(1000), ...t(-30, 2000), ...q(500)]);
    expect(openIn(g.segments(), 3300, 5500)).toBe(false);
  });

  it("lock-out 1: hears a customer 12 dB quieter again within 10 s", () => {
    const g = go([...q(500), ...t(-20, 2000), ...t(-32, 12000)]);
    const first = firstOpen(g.segments(), 3300, 14500);
    expect(first).not.toBeNull();
    expect(first! - 2500).toBeLessThanOrEqual(10000);
  });

  it("lock-out 2: a 0.3 s bang 10 dB louder does not raise the level", () => {
    const g = go([...q(500), ...t(-20, 2000), ...q(300), ...t(-10, 300), ...q(1000), ...t(-20, 1000)]);
    expect(g.level()).toBeCloseTo(-20, 0);
  });

  it("lock-out 3: a voice 8 dB under for 3 s does not let one 15 dB under through afterwards", () => {
    const g = go([...q(500), ...t(-20, 2000), ...t(-28, 3000), ...t(-35, 2000)]);
    expect(openIn(g.segments(), 6300, 7500)).toBe(false);
  });

  it("pushFrame takes samples: a sine at amplitude 0.1 is about -23 dBFS", () => {
    const x = Float32Array.from({ length: 640 }, (_, i) => 0.1 * Math.sin((2 * Math.PI * 200 * i) / 16000));
    expect(frameDb(x)).toBeCloseTo(-23, 0);
    const g = loudGate();
    for (let i = 0; i < 25; i++) g.pushFrame(new Float32Array(640));
    let open = false;
    for (let i = 0; i < 10; i++) open = g.pushFrame(x);
    expect(open).toBe(true);
  });
});

describe("loudGate, turn length cap", () => {
  it("ends a turn after 10 s open and starts the next at once, so talk that never pauses still gets turns", () => {
    const g = loudGate({ frameMs: 40 });
    const opens: boolean[] = [];
    for (let i = 0; i < 25; i++) opens.push(g.push(-70));
    for (let i = 0; i < 625; i++) opens.push(g.push(-20)); // 25 s without a pause
    const segs = g.segments();
    expect(segs.length).toBe(3);
    for (const [s, e] of segs.slice(0, 2)) expect(e - s).toBeLessThanOrEqual(10000);
    // Back to back: the next turn starts where the capped one ended.
    expect(segs[1][0]).toBe(segs[0][1]);
    // The frame where the cap fires reports closed, so the app sends the activity end.
    expect(opens.filter((o, i) => i > 0 && !o && opens[i - 1]).length).toBe(2);
  });

  it("a sentence shorter than the cap is one turn", () => {
    const g = loudGate({ frameMs: 40 });
    for (let i = 0; i < 25; i++) g.push(-70);
    for (let i = 0; i < 225; i++) g.push(-20); // 9 s
    for (let i = 0; i < 50; i++) g.push(-70);
    expect(g.segments().length).toBe(1);
  });
});

describe("loudGate, anchored to the customer (anchor: first-turn or enrol)", () => {
  const F = 40;
  const q = (ms: number): number[] => Array.from({ length: Math.round(ms / F) }, () => -70);
  const t = (db: number, ms: number): number[] => Array.from({ length: Math.round(ms / F) }, () => db);
  const go = (levels: number[], p: Partial<GateParams>, enrol: number[] = []) => {
    const g = loudGate({ frameMs: F, ...p });
    for (const e of enrol) g.learn(e);
    for (const e of levels) g.push(e);
    return g;
  };

  it("first-turn: the first turn sets the level, and a quieter talker alone afterwards stays out", () => {
    const g = go([...q(500), ...t(-20, 3000), ...q(1500), ...t(-30, 4000), ...q(500)], { anchor: "first-turn", askDb: 0 });
    expect(g.level()).toBeCloseTo(-20, 0);
    expect(openIn(g.segments(), 5500, 9000)).toBe(false);
  });

  it("first-turn: a customer 12 dB under the anchor does not open it (the phone falls back to hold to talk)", () => {
    const g = go([...q(500), ...t(-20, 3000), ...q(1500), ...t(-32, 4000), ...q(500)], { anchor: "first-turn", askDb: 0 });
    expect(openIn(g.segments(), 5500, 9000)).toBe(false);
  });

  it("first-turn: accepted speech moves the level slowly, both ways", () => {
    const g = go([...q(500), ...t(-20, 3000), ...q(1500), ...t(-23, 6000), ...q(500)], { anchor: "first-turn", askDb: 0 });
    const l = g.level()!;
    expect(l).toBeLessThan(-20.5);
    expect(l).toBeGreaterThan(-23.1);
  });

  it("anchored: a quieter voice the gate let through (4 dB under) does not drag the level down", () => {
    const g = go([...q(500), ...t(-20, 3000), ...t(-24, 8000), ...q(1000), ...t(-29, 3000), ...q(500)], { anchor: "first-turn", askDb: 0 });
    expect(g.level()!).toBeGreaterThan(-21);
    expect(openIn(g.segments(), 12800, 15500)).toBe(false);
  });

  it("enrol: the enrolment sets the level before anyone talks, so a quieter talker who starts first stays out", () => {
    const g = go([...q(500), ...t(-30, 3000), ...q(500)], { anchor: "enrol", askDb: 0 }, [...q(300), ...t(-20, 2500)]);
    expect(g.segments()).toEqual([]);
  });
});
