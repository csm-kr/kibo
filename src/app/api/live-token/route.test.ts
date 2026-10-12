import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandError } from "@/lib/commands/errors";
import { resetLimits } from "@/lib/limits/ip";
import { POST as command } from "../command/route";
import { POST as createSession } from "../session/route";
import { auth, commandBody, HERO_LINE, jsonRequest, read } from "../testing";
import { POST } from "./route";

const create = vi.fn();
vi.mock("@/lib/agent/live", async (orig) => ({
  ...(await orig<typeof import("@/lib/agent/live")>()),
  geminiTokenIssuer: () => ({ create }),
}));

const KEY = "AIza-test-key-never-sent";

beforeEach(() => {
  resetLimits();
  create.mockReset();
  create.mockResolvedValue({ name: "auth_tokens/abc" });
  vi.stubEnv("GEMINI_API_KEY", KEY);
});
afterEach(() => vi.unstubAllEnvs());

async function demo() {
  const { body } = await read(await createSession(jsonRequest("/api/session", { kioskId: "malo", demo: true })));
  return body as { sessionId: string; kioskToken: string; deviceToken: string };
}

const tokenRequest = (sessionId: string, token?: string) =>
  POST(jsonRequest("/api/live-token", { sessionId, locale: "en" }, token ? auth(token) : {}));

describe("POST /api/live-token", () => {
  it("a device token gets a token, never the API key; no-store", async () => {
    const s = await demo();
    const res = await tokenRequest(s.sessionId, s.deviceToken);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain(KEY);
    const body = JSON.parse(text);
    expect(body).toMatchObject({ ok: true, token: "auth_tokens/abc", model: "gemini-3.8-live", voiceSeconds: 180 });
    expect(typeof body.expiresAt).toBe("number");
    // The instructions travel inside the token, not to the browser.
    expect(text).not.toContain("menu_data");
  });

  it("401 without a token, 403 with the kiosk token", async () => {
    const s = await demo();
    expect((await read(await tokenRequest(s.sessionId))).status).toBe(401);
    const { status, body } = await read(await tokenRequest(s.sessionId, s.kioskToken));
    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(create).not.toHaveBeenCalled();
  });

  it("409 while paying", async () => {
    const s = await demo();
    const send = async (type: string, args: object = {}, extra: Record<string, unknown> = {}) =>
      (await read(await command(jsonRequest("/api/command", commandBody(s.sessionId, type, args, extra), auth(s.kioskToken))))).body;
    await send("setDineOption", { option: "eat_in" });
    const added = await send("addToCart", HERO_LINE);
    await send("requestCheckout");
    expect((await send("confirmCheckout", {}, { cartVersion: added.cartVersion })).status).toBe("paying");
    const { status, body } = await read(await tokenRequest(s.sessionId, s.deviceToken));
    expect(status).toBe(409);
    expect(body.error.code).toBe("CONFLICT");
  });

  it("410 once expired", async () => {
    const s = await demo();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 11 * 60_000);
    try {
      const { status, body } = await read(await tokenRequest(s.sessionId, s.deviceToken));
      expect(status).toBe(410);
      expect(body.error.code).toBe("GONE");
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("429 on the 3rd token of a demo session", async () => {
    const s = await demo();
    await tokenRequest(s.sessionId, s.deviceToken);
    await tokenRequest(s.sessionId, s.deviceToken);
    const { status, body } = await read(await tokenRequest(s.sessionId, s.deviceToken));
    expect(status).toBe(429);
    expect(body.error).toEqual({ code: "RATE_LIMITED", message: "Voice is busy right now. Please type instead." });
  });

  it("an issuer 429 is 429 with the plain message", async () => {
    const s = await demo();
    create.mockRejectedValueOnce(new CommandError("RATE_LIMITED", "Voice is busy right now. Please type instead."));
    const res = await tokenRequest(s.sessionId, s.deviceToken);
    const text = await res.text();
    expect(res.status).toBe(429);
    expect(JSON.parse(text)).toEqual({
      ok: false,
      error: { code: "RATE_LIMITED", message: "Voice is busy right now. Please type instead." },
    });
    expect(text).not.toContain(KEY);
  });

  it("400 for a bad body or session id", async () => {
    const s = await demo();
    for (const b of [{ sessionId: "a/b", locale: "en" }, { sessionId: s.sessionId, locale: "fr" }, { sessionId: s.sessionId, locale: "en", x: 1 }]) {
      const { status } = await read(await POST(jsonRequest("/api/live-token", b, auth(s.deviceToken))));
      expect(status).toBe(400);
    }
  });
});
