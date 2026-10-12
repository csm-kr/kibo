import { describe, expect, it } from "vitest";
import { hashToken, newSessionId, newToken, tokenMatches } from "./tokens";

describe("tokens", () => {
  it("newToken is 32 random bytes in base64url", () => {
    const t = newToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(t, "base64url")).toHaveLength(32);
    expect(newToken()).not.toBe(t);
  });

  it("newSessionId is 16 random bytes in base64url", () => {
    const id = newSessionId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(Buffer.from(id, "base64url")).toHaveLength(16);
    expect(newSessionId()).not.toBe(id);
  });

  it("hashToken is SHA-256 hex", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashToken(newToken())).toMatch(/^[0-9a-f]{64}$/);
  });

  it("tokenMatches compares against the hash", () => {
    const t = newToken();
    const h = hashToken(t);
    expect(tokenMatches(t, h)).toBe(true);
    expect(tokenMatches(newToken(), h)).toBe(false);
    expect(tokenMatches(t, null)).toBe(false);
    expect(tokenMatches("", h)).toBe(false);
    expect(tokenMatches(t, "short")).toBe(false);
  });
});
