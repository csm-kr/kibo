import { describe, expect, it } from "vitest";
import { BARGE_FRAMES, BARGE_RMS, bargeIn, CALIBRATE_FRAMES, ECHO_FACTOR, PREROLL_FRAMES } from "./bargeIn";

const frame = (n: number) => new Float32Array([n]);
const LOUD = BARGE_RMS * 2;
const QUIET = BARGE_RMS / 4;

/** A detector past its first frames, which measured a quiet echo. */
function calibrated(echo = QUIET) {
  const b = bargeIn();
  for (let i = 0; i < CALIBRATE_FRAMES; i++) expect(b.push(frame(-1), echo)).toBe(false);
  return b;
}

// Owner 10-18: when the user talked over the AI, half-duplex dropped their words and the AI kept talking.
describe("bargeIn", () => {
  it("cuts in after enough loud frames within the window, and keeps the frames before it", () => {
    const b = calibrated();
    let cut = false;
    for (let i = 0; i < BARGE_FRAMES - 1; i++) cut = b.push(frame(i), LOUD);
    expect(cut).toBe(false);
    expect(b.push(frame(99), LOUD)).toBe(true);
    const pre = b.take();
    expect(pre.slice(-BARGE_FRAMES).map((f) => f[0])).toEqual([...Array.from({ length: BARGE_FRAMES - 1 }, (_, i) => i), 99]);
    // Taken once: it starts over, calibration included.
    expect(b.take()).toEqual([]);
    expect(b.push(frame(0), LOUD)).toBe(false);
  });

  it("allows short dips between syllables, but not a quiet stretch", () => {
    const b = calibrated();
    const pattern = [LOUD, LOUD, QUIET, LOUD, LOUD, LOUD, QUIET, LOUD];
    expect(pattern.map((rms, i) => b.push(frame(i), rms)).some(Boolean)).toBe(true);
    const sparse = calibrated();
    for (let i = 0; i < 40; i++) expect(sparse.push(frame(i), i % 3 === 0 ? LOUD : QUIET)).toBe(false);
  });

  it("never cuts in during the first frames of a reply, which only measure the echo", () => {
    const b = bargeIn();
    for (let i = 0; i < CALIBRATE_FRAMES; i++) expect(b.push(frame(i), LOUD)).toBe(false);
  });

  it("a loud echo raises the bar: the person must be clearly louder than the AI's own voice coming back", () => {
    const echo = BARGE_RMS * 0.8;
    const b = calibrated(echo);
    for (let i = 0; i < 40; i++) expect(b.push(frame(i), echo * (ECHO_FACTOR - 0.5))).toBe(false);
    const loud = calibrated(echo);
    expect(Array.from({ length: BARGE_FRAMES }, (_, i) => loud.push(frame(i), echo * (ECHO_FACTOR + 0.5))).at(-1)).toBe(true);
  });

  it("the AI's echo under the threshold never cuts in", () => {
    const b = calibrated(0.02);
    for (let i = 0; i < 200; i++) expect(b.push(frame(i), 0.02)).toBe(false);
  });

  it("keeps at most PREROLL_FRAMES frames, the newest", () => {
    const b = bargeIn();
    for (let i = 0; i < PREROLL_FRAMES + 5; i++) b.push(frame(i), QUIET);
    const pre = b.take();
    expect(pre).toHaveLength(PREROLL_FRAMES);
    expect(pre[0][0]).toBe(5);
  });

  it("reset forgets the frames, the count and the echo", () => {
    const b = calibrated();
    for (let i = 0; i < BARGE_FRAMES - 1; i++) b.push(frame(i), LOUD);
    b.reset();
    expect(b.take()).toEqual([]);
    expect(b.push(frame(0), LOUD)).toBe(false);
  });
});
