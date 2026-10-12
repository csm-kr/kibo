import { beforeEach, describe, expect, it } from "vitest";
import { CommandError } from "@/lib/commands/errors";
import { checkIpLimit, resetLimits } from "./ip";

const T0 = 1_000_000;

function rateLimited(fn: () => void): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    if (e instanceof CommandError && e.code === "RATE_LIMITED") return true;
    throw e;
  }
}

beforeEach(() => resetLimits());

describe("checkIpLimit", () => {
  it("allows 60 API requests per minute per IP, then refuses", () => {
    for (let i = 0; i < 60; i++) expect(rateLimited(() => checkIpLimit("1.1.1.1", "api", T0 + i))).toBe(false);
    expect(rateLimited(() => checkIpLimit("1.1.1.1", "api", T0 + 60))).toBe(true);
    expect(rateLimited(() => checkIpLimit("2.2.2.2", "api", T0 + 60))).toBe(false);
  });

  it("allows 10 new sessions per minute per IP", () => {
    for (let i = 0; i < 10; i++) expect(rateLimited(() => checkIpLimit("1.1.1.1", "session", T0))).toBe(false);
    expect(rateLimited(() => checkIpLimit("1.1.1.1", "session", T0))).toBe(true);
  });

  it("starts a new window after a minute", () => {
    for (let i = 0; i < 10; i++) checkIpLimit("1.1.1.1", "session", T0);
    expect(rateLimited(() => checkIpLimit("1.1.1.1", "session", T0 + 59_999))).toBe(true);
    expect(rateLimited(() => checkIpLimit("1.1.1.1", "session", T0 + 60_000))).toBe(false);
  });

  it("counts IPv6 addresses in the same /64 as one client", () => {
    for (let i = 0; i < 10; i++) checkIpLimit(`2001:db8:1:2::${i + 1}`, "session", T0);
    expect(rateLimited(() => checkIpLimit("2001:db8:1:2:ffff:1:2:3", "session", T0))).toBe(true);
    expect(rateLimited(() => checkIpLimit("2001:0db8:0001:0002::abcd", "session", T0))).toBe(true);
    expect(rateLimited(() => checkIpLimit("2001:db8:1:3::1", "session", T0))).toBe(false);
  });

  it("keeps IPv4 and IPv4-mapped IPv6 addresses separate per address", () => {
    for (let i = 0; i < 10; i++) checkIpLimit("::ffff:1.1.1.1", "session", T0);
    expect(rateLimited(() => checkIpLimit("::ffff:1.1.1.1", "session", T0))).toBe(true);
    expect(rateLimited(() => checkIpLimit("::ffff:1.1.1.2", "session", T0))).toBe(false);
    expect(rateLimited(() => checkIpLimit("1.1.1.2", "session", T0))).toBe(false);
  });

  it("uses a plain message", () => {
    for (let i = 0; i < 10; i++) checkIpLimit("1.1.1.1", "session", T0);
    expect(() => checkIpLimit("1.1.1.1", "session", T0)).toThrow("Too many requests. Please wait a moment.");
  });
});
