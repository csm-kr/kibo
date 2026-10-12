import { describe, expect, it } from "vitest";
import { HTTP_STATUS, type ErrorCode } from "@/lib/commands/errors";
import { errorCopy } from "./errors";

const CODES = [...(Object.keys(HTTP_STATUS) as ErrorCode[]), "NETWORK" as const];
const HANGUL = /[가-힣]/;

describe("errorCopy", () => {
  it.each(CODES)("%s has Korean and English copy", (code) => {
    const ko = errorCopy(code, "ko");
    const en = errorCopy(code, "en");
    expect(ko).toMatch(HANGUL);
    expect(en).not.toMatch(HANGUL);
    expect(en.length).toBeGreaterThan(0);
    expect(ko).not.toBe(en);
  });

  it.each(CODES)("%s copy never shows the code", (code) => {
    for (const locale of ["ko", "en"] as const) expect(errorCopy(code, locale)).not.toContain(code);
  });

  it("NEEDS_CHOICE for the dine option asks the dine question", () => {
    expect(errorCopy("NEEDS_CHOICE", "ko", { templateId: "pick_dine" })).toBe("드시고 가세요, 포장하세요?");
    expect(errorCopy("NEEDS_CHOICE", "en", { templateId: "pick_dine" })).toBe("Eat here or take out?");
  });

  it("other NEEDS_CHOICE templates fall back to the code's copy", () => {
    expect(errorCopy("NEEDS_CHOICE", "en", { templateId: "pick_option" })).toBe(errorCopy("NEEDS_CHOICE", "en"));
  });
});
