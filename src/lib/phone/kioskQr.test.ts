import { describe, expect, it } from "vitest";
import { assistantHref, parseKioskQr } from "./kioskQr";

const ORIGIN = "https://kibo.example.app";
const ID = "AbCdEfGhIjKlMnOpQrStUv";
const TOKEN = "x".repeat(43);

describe("parseKioskQr", () => {
  it("accepts the kiosk's own claim URL", () => {
    expect(parseKioskQr(`${ORIGIN}/assistant?s=${ID}#t=${TOKEN}`, ORIGIN)).toEqual({ sessionId: ID, claimToken: TOKEN });
  });

  it("refuses another site as foreign, also http for an https app and another port", () => {
    for (const text of [
      `https://evil.example/assistant?s=${ID}#t=${TOKEN}`,
      `http://kibo.example.app/assistant?s=${ID}#t=${TOKEN}`,
      `https://kibo.example.app:8443/assistant?s=${ID}#t=${TOKEN}`,
      `https://kibo.example.app.evil.example/assistant?s=${ID}#t=${TOKEN}`,
    ]) {
      expect(parseKioskQr(text, ORIGIN)).toEqual({ error: "foreign" });
    }
  });

  it("refuses text that is not a URL, or not one with a script-free scheme, as foreign", () => {
    for (const text of ["hello", "", "javascript:alert(1)", "WIFI:S:x;;", "data:text/html,hi"]) {
      expect(parseKioskQr(text, ORIGIN)).toEqual({ error: "foreign" });
    }
  });

  it("refuses our own site without a valid session and token as malformed", () => {
    for (const text of [
      `${ORIGIN}/assistant?s=${ID}`,
      `${ORIGIN}/assistant?s=${ID}#t=`,
      `${ORIGIN}/assistant#t=${TOKEN}`,
      `${ORIGIN}/assistant?s=short#t=${TOKEN}`,
      `${ORIGIN}/assistant?s=${ID}/x#t=${TOKEN}`,
      `${ORIGIN}/kiosk?s=${ID}#t=${TOKEN}`,
      `${ORIGIN}/assistant/x?s=${ID}#t=${TOKEN}`,
      `${ORIGIN}/assistant?s=${ID}#t=${TOKEN}<script>`,
      `${ORIGIN}/assistant?s=${ID}#t=${"y".repeat(129)}`,
    ]) {
      expect(parseKioskQr(text, ORIGIN)).toEqual({ error: "malformed" });
    }
  });

  it("ignores extra parameters, which never reach the opened link", () => {
    const r = parseKioskQr(`${ORIGIN}/assistant?s=${ID}&next=https://evil.example#t=${TOKEN}&x=1`, ORIGIN);
    expect(r).toEqual({ sessionId: ID, claimToken: TOKEN });
    expect(assistantHref(r as { sessionId: string; claimToken: string })).toBe(`/assistant?s=${ID}#t=${TOKEN}`);
  });

  it("refuses a very long text before parsing it", () => {
    expect(parseKioskQr(`${ORIGIN}/assistant?s=${ID}#t=${TOKEN}&pad=${"a".repeat(5000)}`, ORIGIN)).toEqual({ error: "malformed" });
  });

  it("trims spaces around a pasted link", () => {
    expect(parseKioskQr(`  ${ORIGIN}/assistant?s=${ID}#t=${TOKEN}\n`, ORIGIN)).toEqual({ sessionId: ID, claimToken: TOKEN });
  });
});
