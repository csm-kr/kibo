import { beforeEach, describe, expect, it } from "vitest";
import { resetLimits } from "@/lib/limits/ip";
import { POST as createSession } from "../session/route";
import { auth, jsonRequest, read } from "../testing";
import { POST } from "./route";

beforeEach(() => resetLimits());

describe("POST /api/ping", () => {
  it("returns status, expiry and the server clock", async () => {
    const created = await read(await createSession(jsonRequest("/api/session", { kioskId: "malo" })));
    const before = Date.now();
    const { status, body } = await read(
      await POST(jsonRequest("/api/ping", { sessionId: created.body.sessionId, active: true }, auth(created.body.kioskToken))),
    );
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, status: "idle", expiresAt: expect.any(Number), serverTime: expect.any(Number) });
    expect(body.serverTime).toBeGreaterThanOrEqual(before);
    expect(body.expiresAt).toBeGreaterThan(body.serverTime);
  });

  it("needs a token and a boolean `active`", async () => {
    const created = await read(await createSession(jsonRequest("/api/session", { kioskId: "malo" })));
    const sessionId = created.body.sessionId;
    expect((await POST(jsonRequest("/api/ping", { sessionId, active: true }))).status).toBe(401);
    expect((await POST(jsonRequest("/api/ping", { sessionId, active: "yes" }, auth(created.body.kioskToken)))).status).toBe(400);
  });
});
