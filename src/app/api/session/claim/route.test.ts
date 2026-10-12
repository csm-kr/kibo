import { beforeEach, describe, expect, it } from "vitest";
import { resetLimits } from "@/lib/limits/ip";
import { POST as createSession } from "../route";
import { jsonRequest, read } from "../../testing";
import { POST } from "./route";

beforeEach(() => resetLimits());

async function newSession() {
  const { body } = await read(await createSession(jsonRequest("/api/session", { kioskId: "malo" })));
  return { sessionId: body.sessionId as string, claimToken: new URL(body.claimUrl).hash.slice(3) };
}

describe("POST /api/session/claim", () => {
  it("exchanges the claim token for a device token once; a second claim is CONFLICT", async () => {
    const s = await newSession();
    const first = await read(await POST(jsonRequest("/api/session/claim", s)));
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true, deviceToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), status: "connected" });

    const second = await read(await POST(jsonRequest("/api/session/claim", s)));
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ ok: false, error: { code: "CONFLICT", message: "Someone else is using this kiosk." } });
  });

  it("a wrong claim token is UNAUTHORIZED, an unknown session NOT_FOUND", async () => {
    const s = await newSession();
    const wrong = await read(await POST(jsonRequest("/api/session/claim", { ...s, claimToken: "x".repeat(43) })));
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe("UNAUTHORIZED");
    const missing = await read(await POST(jsonRequest("/api/session/claim", { ...s, sessionId: "A".repeat(22) })));
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
  });

  it("BAD_REQUEST for a sessionId with characters outside base64url", async () => {
    const s = await newSession();
    for (const sessionId of ["a/b", `${"A".repeat(20)}/b`]) {
      const { status, body } = await read(await POST(jsonRequest("/api/session/claim", { ...s, sessionId })));
      expect(status).toBe(400);
      expect(body.error.code).toBe("BAD_REQUEST");
    }
  });

  it("refuses a body without a claim token", async () => {
    const s = await newSession();
    expect((await POST(jsonRequest("/api/session/claim", { sessionId: s.sessionId }))).status).toBe(400);
  });
});
