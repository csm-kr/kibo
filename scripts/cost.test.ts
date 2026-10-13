import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { costPerOrder, liveMessageUsd, median, textOrderUsd, type Prices } from "./cost";

const PRICES: Prices = {
  flashInput: 0.75,
  flashCachedInput: 0.075,
  flashOutput: 3.75,
  liveTextInput: 0.75,
  liveAudioInput: 3,
  liveTextOutput: 4.5,
  liveAudioOutput: 12,
};

describe("textOrderUsd", () => {
  it("bills uncached prompt, cached prompt, and output plus thinking at their own rates", () => {
    // 900k uncached × 0.75 + 100k cached × 0.075 + (10k + 2k) × 3.75, per 1M tokens.
    const usd = textOrderUsd({ prompt: 1_000_000, cached: 100_000, candidates: 10_000, thoughts: 2_000 }, PRICES);
    expect(usd).toBeCloseTo(0.675 + 0.0075 + 0.045, 10);
  });
});

describe("liveMessageUsd", () => {
  it("splits input by modality and bills the unattributed rest as text, thoughts as text output", () => {
    const msg = {
      prompt: 1_000_000,
      candidates: 300_000,
      thoughts: 100_000,
      promptByModality: { TEXT: 800_000, AUDIO: 100_000 },
      responseByModality: { AUDIO: 200_000 },
    };
    // Input: 900k text (800k + 100k unattributed) × 0.75 + 100k audio × 3. Output: 200k audio × 12 + (100k text + 100k thoughts) × 4.5.
    expect(liveMessageUsd(msg, PRICES, "text")).toBeCloseTo(0.675 + 0.3 + 2.4 + 0.9, 10);
    // The bound: the unattributed 100k billed as audio instead.
    expect(liveMessageUsd(msg, PRICES, "audio")).toBeCloseTo(0.6 + 0.6 + 2.4 + 0.9, 10);
  });

  it("bills a message without modality fields as text in and text out", () => {
    expect(liveMessageUsd({ prompt: 1_000_000, candidates: 1_000_000, thoughts: 0 }, PRICES, "text")).toBeCloseTo(0.75 + 4.5, 10);
  });
});

describe("median", () => {
  it("takes the middle value, or the mean of the two middle values", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

describe("evidence/cost-per-order.json", () => {
  const evidence = JSON.parse(readFileSync("evidence/cost-per-order.json", "utf8"));

  it("stores the cost the measured tokens and the stored prices give", () => {
    const computed = costPerOrder(evidence);
    expect(evidence.costUsdPerOrder.text.runs).toEqual(computed.text.runs);
    expect(evidence.costUsdPerOrder.text.median).toBe(computed.text.median);
    expect(evidence.costUsdPerOrder.voice.runs).toEqual(computed.voice.runs);
    expect(evidence.costUsdPerOrder.voice.median).toBe(computed.voice.median);
    expect(evidence.costUsdPerOrder.voice.medianIfUnattributedIsAudio).toBe(computed.voice.medianIfUnattributedIsAudio);
  });

  it("names where and when the prices were read", () => {
    expect(evidence.prices.source).toBe("https://ai.google.dev/gemini-api/docs/pricing");
    expect(evidence.prices.readOn).toBe("2026-10-13");
  });
});
