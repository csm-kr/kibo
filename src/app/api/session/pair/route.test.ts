import { beforeEach, describe, expect, it } from "vitest";
import { resetLimits } from "@/lib/limits/ip";
import { POST as createSession } from "../route";
import { jsonRequest, read } from "../../testing";
import { POST } from "./route";

beforeEach(() => resetLimits());

const WRONG = "That code doesn't match a kiosk. Check the number on the kiosk screen.";

async function newSession() {
  const { body } = await read(await createSession(jsonRequest("/api/session", { kioskId: "malo" })));
  return { sessionId: body.sessionId as string, pairCode: body.pairCode as string };
}

describe("POST /api/session/pair", () => {
  it("exchanges the kiosk's code for a device token once", async () => {
    const s = await newSession();
    const first = await read(await POST(jsonRequest("/api/session/pair", { code: s.pairCode })));
    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      ok: true,
      sessionId: s.sessionId,
      deviceToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      status: "connected",
    });
    const again = await read(await POST(jsonRequest("/api/session/pair", { code: s.pairCode })));
    expect(again.status).toBe(404);
    expect(again.body).toEqual({ ok: false, error: { code: "NOT_FOUND", message: WRONG } });
  });

  it("a code that matches no kiosk is NOT_FOUND with plain words", async () => {
    const s = await newSession();
    const wrong = s.pairCode === "999999" ? "999998" : "999999";
    const { status, body } = await read(await POST(jsonRequest("/api/session/pair", { code: wrong })));
    expect(status).toBe(404);
    expect(body.error.message).toBe(WRONG);
  });

  it("refuses anything but six digits with BAD_REQUEST", async () => {
    for (const b of [{ code: "12345" }, { code: "1234567" }, { code: "12a456" }, { code: 123456 }, { code: "123456", x: 1 }, {}]) {
      expect((await POST(jsonRequest("/api/session/pair", b))).status).toBe(400);
    }
  });

  it("allows 10 attempts a minute per address, then 429, so guessing a code is impractical", async () => {
    const ip = { "x-forwarded-for": "203.0.113.50" };
    for (let i = 0; i < 10; i++) {
      expect((await POST(jsonRequest("/api/session/pair", { code: String(100000 + i) }, ip))).status).not.toBe(429);
    }
    const { status, body } = await read(await POST(jsonRequest("/api/session/pair", { code: "200000" }, ip)));
    expect(status).toBe(429);
    expect(body.error.code).toBe("RATE_LIMITED");
    // Bad bodies count too, and another address is unaffected.
    expect((await POST(jsonRequest("/api/session/pair", { code: "x" }, ip))).status).toBe(429);
    expect((await POST(jsonRequest("/api/session/pair", { code: "200000" }, { "x-forwarded-for": "203.0.113.51" }))).status).toBe(404);
  });
});
