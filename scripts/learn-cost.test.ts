import { describe, expect, it } from "vitest";
import { groupTotals, round4, runCost, type FlashPrices } from "./learn-cost";

// Round numbers so the expected values can be checked by hand: $1 per 1M uncached input, $0.1 cached, $4 output.
const P: FlashPrices = { flashInput: 1, flashCachedInput: 0.1, flashOutput: 4 };

describe("runCost", () => {
  it("bills the cached part of the input at the cached price and the rest at the input price", () => {
    const c = runCost({ inputTokens: 1_000_000, cachedInputTokens: 600_000, outputTokens: 100_000 }, P);
    expect(c).toEqual({
      cachedRecorded: true,
      inputTokens: 1_000_000,
      cachedInputTokens: 600_000,
      uncachedInputTokens: 400_000,
      outputTokens: 100_000,
      // 0.4 + 0.06 + 0.4
      usd: 0.86,
    });
  });

  it("treats a missing cached count as not recorded and bills all input as uncached", () => {
    const c = runCost({ inputTokens: 1_000_000, outputTokens: 100_000 }, P);
    expect(c.cachedRecorded).toBe(false);
    expect(c.cachedInputTokens).toBe(0);
    expect(c.uncachedInputTokens).toBe(1_000_000);
    expect(c.usd).toBe(1.4);
  });

  it("treats a cached count of 0 as not recorded (the learner before 13-blind-kiosks:4 wrote 0 on the Gemini path)", () => {
    const c = runCost({ inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0 }, P);
    expect(c.cachedRecorded).toBe(false);
    expect(c.usd).toBe(1);
  });

  it("rounds USD to 4 decimals", () => {
    // 123,457 uncached input at $1 per 1M = 0.123457
    expect(runCost({ inputTokens: 123_457, outputTokens: 0 }, P).usd).toBe(0.1235);
  });

  it("uses the real price list without float noise", () => {
    // bk1-cinema final: 977,691 input (609,457 cached), 29,088 output at 0.75 / 0.075 / 3.75
    const c = runCost({ inputTokens: 977_691, cachedInputTokens: 609_457, outputTokens: 29_088 }, {
      flashInput: 0.75,
      flashCachedInput: 0.075,
      flashOutput: 3.75,
    });
    expect(c.usd).toBe(0.431);
  });
});

describe("round4", () => {
  it("rounds half up at the fifth decimal", () => {
    expect(round4(0.12345)).toBe(0.1235);
    expect(round4(0.12344)).toBe(0.1234);
    expect(round4(2)).toBe(2);
  });
});

describe("groupTotals", () => {
  const run = (minutes: number, turns: number, finished: boolean, input: number, cached: number | undefined, output: number) => ({
    minutes,
    turns,
    finished,
    ...runCost({ inputTokens: input, cachedInputTokens: cached, outputTokens: output }, P),
  });

  it("sums tokens, minutes, turns and finished runs, and prices the summed tokens", () => {
    const t = groupTotals([run(7.4, 100, true, 1_000_000, 600_000, 100_000), run(2.3, 50, false, 200_000, undefined, 10_000)], P);
    expect(t).toEqual({
      runs: 2,
      finished: 1,
      minutes: 9.7,
      turns: 150,
      inputTokens: 1_200_000,
      cachedInputTokens: 600_000,
      uncachedInputTokens: 600_000,
      outputTokens: 110_000,
      cachedRecordedInAll: false,
      // 0.86 + (0.2 + 0.04)
      usd: 1.1,
    });
  });

  it("is not the sum of the rounded run costs", () => {
    // Three runs of $0.000031 each: rounded per run they are 0, the summed tokens give 0.000093 -> 0.0001.
    const t = groupTotals([1, 2, 3].map(() => run(1, 1, true, 40, 10, 0)), P);
    expect(t.usd).toBe(0.0001);
    expect(t.cachedRecordedInAll).toBe(true);
  });

  it("returns zeros for an empty group", () => {
    expect(groupTotals([], P)).toMatchObject({ runs: 0, finished: 0, minutes: 0, usd: 0, cachedRecordedInAll: true });
  });
});
