import { describe, expect, it } from "vitest";
import { isQuotaError, liveUsd, textUsd } from "./spend";

describe("spend", () => {
  it("prices a Live session from its usage messages: each message bills its whole prompt", () => {
    const usage = [
      { promptTokenCount: 1100, responseTokenCount: 100, promptTokensDetails: [{ modality: "TEXT", tokenCount: 1000 }, { modality: "AUDIO", tokenCount: 100 }], responseTokensDetails: [{ modality: "AUDIO", tokenCount: 100 }] },
      { promptTokenCount: 1000, responseTokenCount: 0, promptTokensDetails: [{ modality: "TEXT", tokenCount: 1000 }] },
    ];
    // text 2000 x 0.75 + audio in 100 x 3 + audio out 100 x 12, per million.
    expect(liveUsd(usage)).toBeCloseTo((2000 * 0.75 + 100 * 3 + 100 * 12) / 1e6, 9);
  });

  it("prices a text call, thinking counted as output", () => {
    expect(textUsd({ promptTokenCount: 1000, candidatesTokenCount: 10, thoughtsTokenCount: 90 })).toBeCloseTo((1000 * 0.75 + 100 * 3.75) / 1e6, 9);
  });

  it("knows a used-up credit or a reached cap", () => {
    expect(isQuotaError({ status: 429, message: "x" })).toBe(true);
    expect(isQuotaError({ status: 402 })).toBe(true);
    expect(isQuotaError(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'))).toBe(true);
    expect(isQuotaError({ reason: "You exceeded your current quota" })).toBe(true);
    expect(isQuotaError(new Error("socket hang up"))).toBe(false);
    expect(isQuotaError({ status: 500 })).toBe(false);
  });
});
