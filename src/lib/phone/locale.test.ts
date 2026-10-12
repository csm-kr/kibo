import { describe, expect, it } from "vitest";
import { phoneLocale } from "./locale";

describe("phoneLocale", () => {
  it("Korean for every ko browser language", () => {
    expect(phoneLocale("ko")).toBe("ko");
    expect(phoneLocale("ko-KR")).toBe("ko");
  });

  it("English for everything else", () => {
    expect(phoneLocale("en-US")).toBe("en");
    expect(phoneLocale("ja-JP")).toBe("en");
    expect(phoneLocale("")).toBe("en");
    expect(phoneLocale(undefined)).toBe("en");
  });

  it("a stored choice wins", () => {
    expect(phoneLocale("ko-KR", "en")).toBe("en");
    expect(phoneLocale("en-US", "ko")).toBe("ko");
  });

  it("ignores a stored value that is not a locale", () => {
    expect(phoneLocale("ko-KR", "fr")).toBe("ko");
    expect(phoneLocale("en", null)).toBe("en");
  });
});
