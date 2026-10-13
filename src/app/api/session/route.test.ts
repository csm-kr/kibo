import { beforeEach, describe, expect, it } from "vitest";
import { resetLimits } from "@/lib/limits/ip";
import { getStore } from "@/lib/store";
import { jsonRequest, read } from "../testing";
import { POST } from "./route";

beforeEach(() => resetLimits());

describe("POST /api/session", () => {
  it("creates a session; the claim token is only in the URL fragment", async () => {
    const { status, body } = await read(
      await POST(jsonRequest("/api/session", { kioskId: "malo" }, { "x-forwarded-proto": "https", "x-forwarded-host": "kibo.example.app" })),
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, sessionId: expect.any(String), kioskToken: expect.any(String), expiresAt: expect.any(Number) });
    expect(body.deviceToken).toBeUndefined();
    const url = new URL(body.claimUrl);
    expect(url.origin).toBe("https://kibo.example.app");
    expect(url.pathname).toBe("/assistant");
    expect(url.search).toBe(`?s=${body.sessionId}`);
    expect(url.hash).toMatch(/^#t=[A-Za-z0-9_-]{43}$/);
    expect(body.pairCode).toMatch(/^\d{6}$/);
    expect((await getStore().get(body.sessionId))?.status).toBe("idle");
  });

  it("a demo session also returns a device token, and no pairing code", async () => {
    const { body } = await read(await POST(jsonRequest("/api/session", { kioskId: "malo", demo: true })));
    expect(body.deviceToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.pairCode).toBeUndefined();
    expect(new URL(body.claimUrl).origin).toBe("http://kibo.test");
  });

  it("refuses bad bodies with BAD_REQUEST", async () => {
    for (const b of ["{nope", { kioskId: "nope" }, { kioskId: "malo", extra: 1 }, { kioskId: 3 }]) {
      const { status, body } = await read(await POST(jsonRequest("/api/session", b)));
      expect(status).toBe(400);
      expect(body).toMatchObject({ ok: false, error: { code: "BAD_REQUEST", message: expect.any(String) } });
    }
  });

  it("the 11th session in a minute from one IP gets 429", async () => {
    const ip = { "x-forwarded-for": "6.6.6.6, 203.0.113.9" };
    for (let i = 0; i < 10; i++) expect((await POST(jsonRequest("/api/session", { kioskId: "malo" }, ip))).status).toBe(200);
    const { status, body } = await read(await POST(jsonRequest("/api/session", { kioskId: "malo" }, ip)));
    expect(status).toBe(429);
    expect(body.error.code).toBe("RATE_LIMITED");
    // Keyed on the last hop, so another client-chosen first hop does not help.
    expect((await POST(jsonRequest("/api/session", { kioskId: "malo" }, { "x-forwarded-for": "7.7.7.7, 203.0.113.9" }))).status).toBe(429);
    expect((await POST(jsonRequest("/api/session", { kioskId: "malo" }, { "x-forwarded-for": "203.0.113.10" }))).status).toBe(200);
  });
});
