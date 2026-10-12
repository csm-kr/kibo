import { describe, expect, it } from "vitest";
import { e2eFrame, e2eOutput, frameRms, newMarks } from "./e2eMarks";

const voiced = 0.1;
const silent = 0;

/** 1 s of silence opens the gate; the sentence then starts at 0 ms. */
function open(m: ReturnType<typeof newMarks>) {
  e2eFrame(m, silent, -1000);
  e2eFrame(m, silent, 0);
}

describe("e2e voice marks", () => {
  it("measures the RMS of a frame", () => {
    expect(frameRms(new Float32Array([0, 0]))).toBe(0);
    expect(frameRms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5);
  });

  it("holds frames until 1 s of silence, so Live never hears half a sentence from a looping file", () => {
    const m = newMarks();
    expect(e2eFrame(m, voiced, 10)).toBe(false);
    // A pause inside the sentence does not open it.
    expect(e2eFrame(m, silent, 50)).toBe(false);
    expect(e2eFrame(m, silent, 500)).toBe(false);
    expect(e2eFrame(m, voiced, 540)).toBe(false);
    expect(e2eFrame(m, silent, 580)).toBe(false);
    expect(m.lastVoiced).toBeNull();
    expect(e2eFrame(m, silent, 1580)).toBe(true);
    expect(e2eFrame(m, voiced, 1620)).toBe(true);
    expect(m.lastVoiced).toBe(1620);
  });

  it("sends one utterance: after 1.5 s of silence only silent frames go, so the looping file never speaks twice", () => {
    const m = newMarks();
    open(m);
    e2eFrame(m, voiced, 100);
    expect(e2eFrame(m, silent, 1500)).toBe(true);
    expect(e2eFrame(m, voiced, 1550)).toBe(true);
    expect(e2eFrame(m, silent, 3060)).toBe(true);
    expect(e2eFrame(m, voiced, 3100)).toBe(false);
    expect(e2eFrame(m, silent, 3140)).toBe(true);
    expect(m.lastVoiced).toBe(1550);
  });

  it("records the first tool call", () => {
    const m = newMarks();
    open(m);
    e2eFrame(m, voiced, 100);
    e2eOutput(m, "audio", 600);
    e2eOutput(m, "tool", 800);
    e2eOutput(m, "tool", 900);
    expect(m).toMatchObject({ speechEnd: 100, firstAudio: 600, firstTool: 800 });
  });

  it("takes the end of speech as the last voiced frame before the model's first output, and keeps the first ones", () => {
    const m = newMarks();
    open(m);
    e2eFrame(m, voiced, 100);
    e2eFrame(m, voiced, 140);
    e2eFrame(m, silent, 180);
    e2eOutput(m, "tool", 900);
    expect(m).toMatchObject({ speechEnd: 140, firstOutput: 900, firstAudio: null });
    // The model answered: the utterance is over even if the silence was cut short by the reply.
    expect(e2eFrame(m, voiced, 1000)).toBe(false);
    e2eOutput(m, "audio", 1200);
    e2eOutput(m, "audio", 1300);
    expect(m).toMatchObject({ speechEnd: 140, firstOutput: 900, firstAudio: 1200 });
  });

  it("ignores output before any speech was sent", () => {
    const m = newMarks();
    e2eOutput(m, "audio", 50);
    expect(m).toMatchObject({ speechEnd: null, firstOutput: null, firstAudio: null, firstTool: null });
  });
});
