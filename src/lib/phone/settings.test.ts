import { describe, expect, it } from "vitest";
import {
  AI_LANGUAGE_KEY,
  AI_VOICE_KEY,
  readLanguage,
  writeLanguage,
  LARGE_TEXT_KEY,
  LAST_ORDER_KEY,
  LOCALE_KEY,
  lastOrderRecord,
  readSettings,
  resumeHref,
  writeSettings,
} from "./settings";

function memory(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("the AI language (14-final:4)", () => {
  it("is the screen language until an AI-only language is chosen", () => {
    expect(readLanguage(memory(), "ko-KR")).toBe("ko");
    expect(readLanguage(memory({ [LOCALE_KEY]: "en" }), "ko-KR")).toBe("en");
  });

  it("choosing Japanese keeps English screens and remembers Japanese for the AI", () => {
    const store = memory({ [LOCALE_KEY]: "ko" });
    writeLanguage(store, "ja");
    expect(readSettings(store, "ko").locale).toBe("en");
    expect(readLanguage(store, "ko")).toBe("ja");
  });

  it("choosing Korean or English, here or on /app, ends the AI-only language", () => {
    const store = memory();
    writeLanguage(store, "th");
    writeLanguage(store, "ko");
    expect(readLanguage(store, "en")).toBe("ko");
    writeLanguage(store, "vi");
    writeSettings(store, { locale: "en" });
    expect(readLanguage(store, "ko")).toBe("en");
  });

  it("ignores a stored value that is not on the list, and its key cannot clash with a device token", () => {
    expect(readLanguage(memory({ [LOCALE_KEY]: "en", [AI_LANGUAGE_KEY]: "de" }), "en")).toBe("en");
    expect(AI_LANGUAGE_KEY.slice("kibo.phone.".length).length).toBeLessThan(16);
  });
});

describe("readSettings", () => {
  it("defaults: browser language, AI voice on, normal text", () => {
    expect(readSettings(memory(), "ko-KR")).toEqual({ locale: "ko", aiVoice: true, largeText: false });
    expect(readSettings(memory(), "en-US")).toEqual({ locale: "en", aiVoice: true, largeText: false });
  });

  it("reads stored choices", () => {
    const store = memory({ [LOCALE_KEY]: "en", [AI_VOICE_KEY]: "off", [LARGE_TEXT_KEY]: "on" });
    expect(readSettings(store, "ko-KR")).toEqual({ locale: "en", aiVoice: false, largeText: true });
  });

  it("keeps the locale key /assistant already used", () => {
    expect(LOCALE_KEY).toBe("kibo.phone.locale");
  });

  it("ignores invalid stored values", () => {
    const store = memory({ [LOCALE_KEY]: "fr", [AI_VOICE_KEY]: "maybe", [LARGE_TEXT_KEY]: "true" });
    expect(readSettings(store, "ko")).toEqual({ locale: "ko", aiVoice: true, largeText: false });
  });

  it("never collides with a stored device token key (session ids are 16-64 characters)", () => {
    for (const key of [LOCALE_KEY, AI_VOICE_KEY, LARGE_TEXT_KEY, LAST_ORDER_KEY]) {
      expect(key.slice("kibo.phone.".length).length).toBeLessThan(16);
    }
  });
});

describe("writeSettings", () => {
  it("writes only the given settings, read back the same", () => {
    const store = memory({ [LOCALE_KEY]: "ko" });
    writeSettings(store, { aiVoice: false, largeText: true });
    expect(store.data.get(LOCALE_KEY)).toBe("ko");
    expect(readSettings(store, "en")).toEqual({ locale: "ko", aiVoice: false, largeText: true });
    writeSettings(store, { locale: "en", aiVoice: true, largeText: false });
    expect(readSettings(store, "ko")).toEqual({ locale: "en", aiVoice: true, largeText: false });
  });
});

describe("resumeHref", () => {
  const id = "abcdefghijklmnop1234";
  const now = 1_000_000;
  const token = (sid: string) => (sid === id ? "device-token" : null);
  const rec = (status: string, expiresAt = now + 60_000) => lastOrderRecord({ sessionId: id, status, expiresAt } as never);

  it("a live order with a stored device token can be continued", () => {
    for (const status of ["connected", "ordering", "confirming", "paying"]) {
      expect(resumeHref(rec(status), token, now)).toBe(`/assistant?s=${id}`);
    }
  });

  it("hides paid and expired orders", () => {
    expect(resumeHref(rec("paid"), token, now)).toBeNull();
    expect(resumeHref(rec("expired"), token, now)).toBeNull();
  });

  it("hides an order past its expiry time", () => {
    expect(resumeHref(rec("ordering", now), token, now)).toBeNull();
    expect(resumeHref(rec("ordering", now - 1), token, now)).toBeNull();
  });

  it("hides an order whose device token is gone (another phone took over)", () => {
    expect(resumeHref(rec("ordering"), () => null, now)).toBeNull();
  });

  it("hides nothing stored and broken records", () => {
    expect(resumeHref(null, token, now)).toBeNull();
    expect(resumeHref("not json", token, now)).toBeNull();
    expect(resumeHref(JSON.stringify({ sessionId: "a/b", status: "ordering", expiresAt: now + 1 }), token, now)).toBeNull();
    expect(resumeHref(JSON.stringify({ sessionId: id, status: "nope", expiresAt: now + 1 }), token, now)).toBeNull();
    expect(resumeHref(JSON.stringify({ sessionId: id, status: "ordering" }), token, now)).toBeNull();
  });
});
