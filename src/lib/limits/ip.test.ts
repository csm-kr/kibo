import { beforeEach, describe, expect, it } from "vitest";
import { CommandError } from "@/lib/commands/errors";
import { checkIpLimit, giveBackDailyBudget, openStream, resetLimits, takeDailyBudget } from "./ip";

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
  it("allows 240 API requests per minute per IP, then refuses", () => {
    for (let i = 0; i < 240; i++) expect(rateLimited(() => checkIpLimit("1.1.1.1", "api", T0 + i))).toBe(false);
    expect(rateLimited(() => checkIpLimit("1.1.1.1", "api", T0 + 240))).toBe(true);
    expect(rateLimited(() => checkIpLimit("2.2.2.2", "api", T0 + 240))).toBe(false);
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

describe("takeDailyBudget (I-148)", () => {
  /** 2026-10-13 23:59 KST */
  const NIGHT = Date.UTC(2026, 9, 13, 14, 59);

  it("gives one address 24 Live tokens and 300 chat messages a KST day", () => {
    for (let i = 0; i < 24; i++) expect(takeDailyBudget("1.1.1.1", "voice", NIGHT)).toBe(true);
    expect(takeDailyBudget("1.1.1.1", "voice", NIGHT)).toBe(false);
    expect(takeDailyBudget("2.2.2.2", "voice", NIGHT)).toBe(true);
    for (let i = 0; i < 300; i++) expect(takeDailyBudget("1.1.1.1", "chat", NIGHT)).toBe(true);
    expect(takeDailyBudget("1.1.1.1", "chat", NIGHT)).toBe(false);
    // Midnight KST starts a new day.
    expect(takeDailyBudget("1.1.1.1", "voice", NIGHT + 60_000)).toBe(true);
  });

  it("counts a /64 as one address", () => {
    for (let i = 0; i < 24; i++) takeDailyBudget(`2001:db8:1:2::${i + 1}`, "voice", NIGHT);
    expect(takeDailyBudget("2001:db8:1:2::ff", "voice", NIGHT)).toBe(false);
  });

  it("takes back what giveBackDailyBudget returns", () => {
    for (let i = 0; i < 24; i++) takeDailyBudget("1.1.1.1", "voice", NIGHT);
    giveBackDailyBudget("1.1.1.1", "voice", NIGHT);
    expect(takeDailyBudget("1.1.1.1", "voice", NIGHT)).toBe(true);
    expect(takeDailyBudget("1.1.1.1", "voice", NIGHT)).toBe(false);
  });
});

describe("openStream (I-149)", () => {
  it("allows 40 open streams per address and frees one on release, once", () => {
    const releases = Array.from({ length: 40 }, () => openStream("1.1.1.1"));
    expect(rateLimited(() => openStream("1.1.1.1"))).toBe(true);
    expect(rateLimited(() => openStream("2.2.2.2"))).toBe(false);
    releases[0]();
    releases[0]();
    expect(rateLimited(() => openStream("1.1.1.1"))).toBe(false);
    expect(rateLimited(() => openStream("1.1.1.1"))).toBe(true);
  });
});
