import { describe, expect, it } from "vitest";
import { AI_ONLY_KEYS, LANGUAGES, SPEECH_LANGUAGES, aiOnly, isSpeechLanguage, lt, uiLocale } from "./languages";
import { pt } from "./phone";

describe("speech languages (14-final:4)", () => {
  it("lists Korean and English first, then the AI-only languages, each with a native name and a Live code", () => {
    expect(SPEECH_LANGUAGES.slice(0, 2)).toEqual(["ko", "en"]);
    expect(SPEECH_LANGUAGES).toEqual(expect.arrayContaining(["ja", "zh", "es", "vi", "fr", "th", "id"]));
    for (const l of SPEECH_LANGUAGES) {
      expect(LANGUAGES[l].native.length).toBeGreaterThan(0);
      expect(LANGUAGES[l].liveCode).toMatch(/^[a-z]{2,3}-[A-Z]{2}$/);
    }
  });

  it("the screens stay Korean or English: every other language shows English chrome", () => {
    expect(uiLocale("ko")).toBe("ko");
    expect(uiLocale("en")).toBe("en");
    expect(uiLocale("ja")).toBe("en");
    expect(aiOnly("ko")).toBe(false);
    expect(aiOnly("th")).toBe(true);
  });

  it("accepts only the listed codes", () => {
    expect(isSpeechLanguage("vi")).toBe(true);
    expect(isSpeechLanguage("de")).toBe(false);
    expect(isSpeechLanguage(null)).toBe(false);
  });

  it("translates the handful of strings a first-time user must read, in every AI-only language", () => {
    for (const l of SPEECH_LANGUAGES.filter(aiOnly)) {
      for (const key of AI_ONLY_KEYS) {
        const text = lt(key, l);
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toBe(pt(key, "en"));
      }
    }
    expect(lt("payNow", "ja")).toBe("はい、支払います");
  });

  it("falls back to the phone's Korean or English copy for everything else, and for ko and en", () => {
    expect(lt("payNow", "ko")).toBe(pt("payNow", "ko"));
    expect(lt("payNow", "en")).toBe(pt("payNow", "en"));
    expect(lt("cartTitle", "ja")).toBe(pt("cartTitle", "en"));
    expect(lt("cartTitle", "fr", "ticket")).toBe(pt("cartTitle", "en", "ticket"));
  });
});
