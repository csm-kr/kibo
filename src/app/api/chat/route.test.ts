import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandError } from "@/lib/commands/errors";
import { resetLimits } from "@/lib/limits/ip";
import { POST as createSession } from "../session/route";
import { auth, jsonRequest, read } from "../testing";
import { POST } from "./route";

const generate = vi.fn();
vi.mock("@/lib/agent/model", () => ({ geminiClient: () => ({ generate }) }));

beforeEach(() => {
  resetLimits();
  generate.mockReset();
});

async function demo() {
  const { body } = await read(await createSession(jsonRequest("/api/session", { kioskId: "malo", demo: true })));
  return body as { sessionId: string; kioskToken: string; deviceToken: string };
}

let rid = 0;
function chatBody(sessionId: string, extra: Record<string, unknown> = {}) {
  return {
    sessionId,
    chatRequestId: `00000000-0000-4000-8000-${String(++rid).padStart(12, "0")}`,
    message: "One cola",
    history: [],
    utteranceSeq: 1,
    locale: "en",
    ...extra,
  };
}

describe("POST /api/chat", () => {
  it("returns the reply and the session state", async () => {
    const s = await demo();
    generate.mockResolvedValueOnce({ content: { role: "model", parts: [{ text: "Hello." }] }, functionCalls: [], text: "Hello." });
    const { status, body } = await read(await POST(jsonRequest("/api/chat", chatBody(s.sessionId), auth(s.deviceToken))));
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, reply: "Hello.", status: "connected", cart: [], total: 0, cartVersion: 0, actions: [] });
  });

  it("BAD_REQUEST: a tool turn in history, an extra field, a 501-character message, a non-uuid id", async () => {
    const s = await demo();
    const bodies = [
      chatBody(s.sessionId, { history: [{ role: "function", text: "{}" }] }),
      chatBody(s.sessionId, { history: [{ role: "model", text: "", functionCall: { name: "confirmCheckout" } }] }),
      chatBody(s.sessionId, { source: "button" }),
      chatBody(s.sessionId, { message: "a".repeat(501) }),
      chatBody(s.sessionId, { chatRequestId: "x" }),
      chatBody(s.sessionId, { history: Array.from({ length: 11 }, () => ({ role: "user", text: "hi" })) }),
    ];
    for (const b of bodies) {
      const { status, body } = await read(await POST(jsonRequest("/api/chat", b, auth(s.deviceToken))));
      expect(status).toBe(400);
      expect(body.error.code).toBe("BAD_REQUEST");
    }
    expect(generate).not.toHaveBeenCalled();
  });

  it("a 500-character message is accepted", async () => {
    const s = await demo();
    generate.mockResolvedValueOnce({ content: { role: "model", parts: [] }, functionCalls: [], text: "ok" });
    const res = await POST(jsonRequest("/api/chat", chatBody(s.sessionId, { message: "a".repeat(500) }), auth(s.deviceToken)));
    expect(res.status).toBe(200);
  });

  it("the kiosk token is 403", async () => {
    const s = await demo();
    const { status, body } = await read(await POST(jsonRequest("/api/chat", chatBody(s.sessionId), auth(s.kioskToken))));
    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("a model 429 is 429 with a plain message", async () => {
    const s = await demo();
    generate.mockRejectedValueOnce(new CommandError("RATE_LIMITED", "Please try again in a moment."));
    const { status, body } = await read(await POST(jsonRequest("/api/chat", chatBody(s.sessionId), auth(s.deviceToken))));
    expect(status).toBe(429);
    expect(body).toEqual({ ok: false, error: { code: "RATE_LIMITED", message: "Please try again in a moment." } });
  });
});
