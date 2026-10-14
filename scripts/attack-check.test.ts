import { describe, expect, it } from "vitest";
import { buildEvidence, findLeaks, matches, summarize, type AttemptRecord } from "./attacks";

const TOKEN = "Zk3_q9XbT0uV-aP4rLm8sW2yNc6dEf1hJg5iKo7tQx0"; // 43 chars, the shape of a real token
const SESSION = "aB3dE5fG7hJ9kL1mN3pQ5r"; // 22 chars, the shape of a session id

function record(over: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    name: "phone_card_action",
    kind: "attack",
    tries: "The phone token sends cardAction",
    expected: { status: 403, code: "FORBIDDEN" },
    got: { status: 403, code: "FORBIDDEN", message: "This action is not allowed here.", sessionUnchanged: true },
    pass: true,
    ...over,
  };
}

describe("matches", () => {
  it("accepts the expected status and code", () => {
    expect(matches({ status: 401, code: "UNAUTHORIZED" }, { status: 401, code: "UNAUTHORIZED" }, "attack")).toBe(true);
  });

  it("refuses another status or code", () => {
    expect(matches({ status: 401, code: "UNAUTHORIZED" }, { status: 200 }, "attack")).toBe(false);
    expect(matches({ status: 409, code: "CONFLICT" }, { status: 409, code: "GONE" }, "attack")).toBe(false);
  });

  it("checks the message only when one is expected", () => {
    const want = { status: 409, code: "CONFLICT", message: "Please confirm on the card." };
    expect(matches(want, { status: 409, code: "CONFLICT", message: "Please confirm on the card." }, "attack")).toBe(true);
    expect(matches(want, { status: 409, code: "CONFLICT", message: "Your order changed. Please check it again." }, "attack")).toBe(false);
    expect(matches({ status: 409, code: "CONFLICT" }, { status: 409, code: "CONFLICT", message: "anything" }, "attack")).toBe(true);
  });

  it("accepts any of several expectations", () => {
    const want = [{ status: 400, code: "BAD_REQUEST" }, { status: 422 }];
    expect(matches(want, { status: 422, code: "NEEDS_CHOICE" }, "attack")).toBe(true);
    expect(matches(want, { status: 400, code: "BAD_REQUEST" }, "attack")).toBe(true);
    expect(matches(want, { status: 409, code: "CONFLICT" }, "attack")).toBe(false);
  });

  it("needs duplicate: true for a replay", () => {
    const want = { status: 200, duplicate: true };
    expect(matches(want, { status: 200, duplicate: true, sessionUnchanged: true }, "attack")).toBe(true);
    expect(matches(want, { status: 200, sessionUnchanged: true }, "attack")).toBe(false);
  });

  it("fails an attack that changed the session, even with the expected status", () => {
    expect(matches({ status: 200, duplicate: true }, { status: 200, duplicate: true, sessionUnchanged: false }, "attack")).toBe(false);
    expect(matches({ status: 403, code: "FORBIDDEN" }, { status: 403, code: "FORBIDDEN", sessionUnchanged: null }, "attack")).toBe(true);
  });

  it("does not require an unchanged session for a control", () => {
    expect(matches({ status: 200 }, { status: 200, sessionUnchanged: false }, "control")).toBe(true);
  });
});

describe("summarize", () => {
  it("counts attacks and controls separately and names the unexpected ones", () => {
    const s = summarize([
      record(),
      record({ name: "replay", pass: false }),
      record({ name: "tap_confirm", kind: "control", expected: { status: 200 }, got: { status: 200, sessionUnchanged: null } }),
      record({ name: "card_paid", kind: "control", pass: false }),
    ]);
    expect(s).toEqual({
      attempts: 4,
      attacks: 2,
      refusedAsExpected: 1,
      controls: 2,
      controlsAsExpected: 1,
      unexpected: 2,
      unexpectedNames: ["replay", "card_paid"],
    });
  });
});

describe("findLeaks", () => {
  it("finds a known secret without repeating it", () => {
    const leaks = findLeaks(JSON.stringify({ message: `token ${TOKEN}` }), [TOKEN, SESSION]);
    expect(leaks).toHaveLength(1);
    expect(leaks.join(" ")).not.toContain(TOKEN);
  });

  it("finds a token-like string that is not in the list", () => {
    expect(findLeaks(`{"x":"${TOKEN}"}`, [])).toHaveLength(1);
    expect(findLeaks(`{"x":"https://h/assistant?s=abc#t=xyz"}`, [])).toHaveLength(1);
    expect(findLeaks(`{"x":"Bearer abc"}`, [])).toHaveLength(1);
  });

  it("passes plain names, codes and messages", () => {
    const text = JSON.stringify([record(), record({ name: "ai_confirm_same_utterance_seq_on_phone_review" })]);
    expect(findLeaks(text, [TOKEN, SESSION])).toEqual([]);
  });
});

describe("buildEvidence", () => {
  const about = { what: "forged commands", date: "2026-10-14T00:00:00.000Z", commit: "abc123" };

  it("adds the summary to the records", () => {
    const e = buildEvidence(about, [record()], [TOKEN]);
    expect(e.summary.refusedAsExpected).toBe(1);
    expect(e.attempts).toHaveLength(1);
  });

  it("refuses to build a file that would hold a token or session id", () => {
    const leaky = record({ got: { status: 403, code: "FORBIDDEN", message: `no ${SESSION}`, sessionUnchanged: true } });
    expect(() => buildEvidence(about, [leaky], [TOKEN, SESSION])).toThrow(/secret/);
    try {
      buildEvidence(about, [leaky], [TOKEN, SESSION]);
    } catch (e) {
      expect(String(e)).not.toContain(SESSION);
    }
  });
});
