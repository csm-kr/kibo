import { describe, expect, it } from "vitest";
import type { Session } from "@/types/session";
import { FOLLOW_MS, followLine } from "./follow";

const change = (over: Partial<NonNullable<Session["lastChange"]>> = {}): Session["lastChange"] => ({
  lineId: "l1",
  kind: "add",
  source: "voice",
  at: 10_000,
  ...over,
});

describe("followLine", () => {
  it("follows a line the talk just added or changed", () => {
    expect(followLine(change(), false, 11_000)).toBe("l1");
    expect(followLine(change({ kind: "update", source: "text" }), false, 11_000)).toBe("l1");
  });

  it("leaves the open question first: choices on the phone win", () => {
    expect(followLine(change(), true, 11_000)).toBeNull();
  });

  it("has no line to follow after a removal, an undo or a cleared cart", () => {
    for (const kind of ["remove", "undo", "clear"] as const) expect(followLine(change({ kind }), false, 11_000)).toBeNull();
    expect(followLine(change({ lineId: null }), false, 11_000)).toBeNull();
    expect(followLine(null, false, 11_000)).toBeNull();
  });

  it("stops following an old change, so a later question's reply is not pulled down to it", () => {
    expect(followLine(change(), false, 10_000 + FOLLOW_MS)).toBe("l1");
    expect(followLine(change(), false, 10_000 + FOLLOW_MS + 1)).toBeNull();
  });
});
