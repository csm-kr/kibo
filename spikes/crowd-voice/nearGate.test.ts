import { describe, expect, it } from "vitest";
import { HANG_FRAMES, LEARN_FRAMES, LOOKBACK_FRAMES, NEAR_RATIO, nearGate, START_LEVEL } from "./nearGate";

const SIZE = 4;
/** A frame whose RMS is `level`. */
const frame = (level: number) => new Float32Array(SIZE).fill(level);
/** Whether a sent frame is the audio that came in at `level` (32-bit samples, so not exactly equal). */
const at = (level: number) => (f: Float32Array) => Math.abs(f[0] - level) < 1e-6;
const silent = (f: Float32Array) => f.every((x) => x === 0);

const USER = 0.1;
/** A bystander about 15 dB below the user. */
const FAR = USER * 0.18;

function feed(g: ReturnType<typeof nearGate>, level: number, frames: number): Float32Array[] {
  const out: Float32Array[] = [];
  for (let i = 0; i < frames; i++) out.push(...g.push(frame(level)));
  return out;
}

/** A gate that has heard the user speak long enough to know their level. */
function learned() {
  const g = nearGate();
  feed(g, USER, LEARN_FRAMES + 5);
  // Past the hang-over, so the gate is shut again.
  feed(g, 0, HANG_FRAMES + LOOKBACK_FRAMES + 2);
  return g;
}

// Owner 11-22: in a loud hall the phone also hears the people around it. Live then never sees the silence that ends
// the user's turn, and it answers and orders for bystanders (spikes/crowd-voice).
describe("nearGate", () => {
  it("lets the user's speech through unchanged, the frames just before it included", () => {
    const g = learned();
    const sent = feed(g, USER, 10);
    // The quiet frames held back while the gate was shut come out first, as they were, so no first sound is lost.
    expect(sent.length).toBeGreaterThanOrEqual(10);
    expect(sent.filter(at(USER))).toHaveLength(10);
  });

  it("sends silence, not nothing, for bystanders once it knows the user's level", () => {
    const g = learned();
    const sent = feed(g, FAR, 50);
    // Live needs frames of silence to end the user's turn (end of speech after 1 s of silence).
    expect(sent).toHaveLength(50);
    expect(sent.every(silent)).toBe(true);
    expect(sent.every((f) => f.length === SIZE)).toBe(true);
  });

  it("keeps the gate open over short dips inside a sentence, then shuts after the hang-over", () => {
    const g = learned();
    feed(g, USER, 5);
    const dip = feed(g, FAR, HANG_FRAMES - 1);
    expect(dip.every((f) => !silent(f))).toBe(true);
    feed(g, USER, 3);
    const after = feed(g, FAR, HANG_FRAMES + LOOKBACK_FRAMES + 20);
    expect(after.slice(-20).every(silent)).toBe(true);
  });

  it("does not open for one loud frame alone", () => {
    const g = learned();
    feed(g, FAR, 5);
    const sent = [...g.push(frame(USER)), ...feed(g, FAR, 10)];
    expect(sent.every(silent)).toBe(true);
  });

  it("still hears the user when they speak more quietly than before", () => {
    const g = learned();
    const quiet = USER * 0.5;
    expect(quiet).toBeGreaterThan(USER * NEAR_RATIO);
    const sent = feed(g, quiet, 10);
    expect(sent.filter(at(quiet))).toHaveLength(10);
  });

  it("starts from a fixed level, so the room is kept out before the user's first word", () => {
    const loudEnough = START_LEVEL * NEAR_RATIO * 1.2;
    const sent = feed(nearGate(), loudEnough, 10);
    expect(sent.filter(at(loudEnough)).length).toBeGreaterThanOrEqual(10 - LOOKBACK_FRAMES);
    const hush = feed(nearGate(), START_LEVEL * NEAR_RATIO * 0.8, 10);
    expect(hush.every(silent)).toBe(true);
  });

  it("learns the user's level over bystanders it heard first", () => {
    const g = nearGate();
    feed(g, FAR, 60);
    feed(g, USER, LEARN_FRAMES + 5);
    feed(g, 0, HANG_FRAMES + LOOKBACK_FRAMES + 2);
    expect(feed(g, FAR, 30).every(silent)).toBe(true);
  });

  it("does not take a short loud burst for the user's level", () => {
    const g = learned();
    // A cough or a bump on the phone, much louder than speech.
    feed(g, USER * 5, 5);
    feed(g, 0, HANG_FRAMES + LOOKBACK_FRAMES + 2);
    const sent = feed(g, USER, 10);
    expect(sent.filter(at(USER))).toHaveLength(10);
  });

  it("keeps bystanders out however long the user reads the menu", () => {
    const g = learned();
    expect(feed(g, FAR, 1500).every(silent)).toBe(true);
    expect(feed(g, USER, 10).filter(at(USER))).toHaveLength(10);
  });
});
