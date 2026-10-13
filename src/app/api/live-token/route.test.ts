import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandError } from "@/lib/commands/errors";
import { resetLimits } from "@/lib/limits/ip";
import { POST as command } from "../command/route";
import { POST as claimRoute } from "../session/claim/route";
import { POST as createSession } from "../session/route";
import { auth, commandBody, HERO_LINE, jsonRequest, read } from "../testing";
import { POST } from "./route";

const create = vi.fn();
vi.mock("@/lib/agent/live", async (orig) => ({
  ...(await orig<typeof import("@/lib/agent/live")>()),
  geminiTokenIssuer: () => ({ create }),
}));
// The key probe would call Gemini; each test says whether the key can generate.
const keyUsable = vi.fn();
vi.mock("@/lib/agent/liveBackend", async (orig) => ({
  ...(await orig<typeof import("@/lib/agent/liveBackend")>()),
  sharedKeyHealth: () => ({ usable: keyUsable, failed: () => {} }),
}));
const RELAY = "wss://kibo-voice.example.run.app/ws";

const KEY = "AIza-test-key-never-sent";

beforeEach(() => {
  resetLimits();
  create.mockReset();
  create.mockResolvedValue({ name: "auth_tokens/abc" });
  keyUsable.mockReset();
  keyUsable.mockResolvedValue(true);
  vi.stubEnv("GEMINI_API_KEY", KEY);
  vi.stubEnv("GEMINI_LIVE_BACKEND", "");
  vi.stubEnv("VOICE_RELAY_URL", "");
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
    expect(body).toMatchObject({ ok: true, mode: "direct", token: "auth_tokens/abc", model: "gemini-3.8-live", voiceSeconds: 180 });
    expect(typeof body.expiresAt).toBe("number");
    // The instructions travel inside the token, not to the browser.
    expect(text).not.toContain("menu_data");
  });

  it("GEMINI_LIVE_BACKEND=vertex: only the relay address; no token, instructions or key in the reply", async () => {
    vi.stubEnv("GEMINI_LIVE_BACKEND", "vertex");
    vi.stubEnv("VOICE_RELAY_URL", RELAY);
    const s = await demo();
    const res = await tokenRequest(s.sessionId, s.deviceToken);
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ ok: true, mode: "relay", url: RELAY });
    expect(text).not.toContain(KEY);
    expect(create).not.toHaveBeenCalled();
    // Nothing counted here, so a demo session can still ask more than its 2 tokens of the relay's address.
    for (let i = 0; i < 3; i++) expect((await tokenRequest(s.sessionId, s.deviceToken)).status).toBe(200);
    expect((await read(await tokenRequest(s.sessionId))).status).toBe(401);
  });

  it("auto with the key's credits used up (402 from the probe) and a relay: the relay address", async () => {
    vi.stubEnv("VOICE_RELAY_URL", RELAY);
    keyUsable.mockResolvedValue(false);
    const s = await demo();
    expect((await read(await tokenRequest(s.sessionId, s.deviceToken))).body).toEqual({ ok: true, mode: "relay", url: RELAY });
    keyUsable.mockResolvedValue(true);
    expect((await read(await tokenRequest(s.sessionId, s.deviceToken))).body.mode).toBe("direct");
  });

  it("vertex without VOICE_RELAY_URL: 502 voice not available", async () => {
    vi.stubEnv("GEMINI_LIVE_BACKEND", "vertex");
    const s = await demo();
    const { status, body } = await read(await tokenRequest(s.sessionId, s.deviceToken));
    expect(status).toBe(502);
    expect(body.error.code).toBe("UPSTREAM");
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

  // I-150: the per-session and daily counters were spent before the issuer answered, so an upstream blip cost a token.
  it("I-150: a token the issuer failed to create does not count against the session", async () => {
    const s = await demo();
    vi.spyOn(console, "error").mockImplementation(() => {});
    create.mockRejectedValueOnce(new CommandError("UPSTREAM", "Voice is not available right now. Please type instead."));
    expect((await tokenRequest(s.sessionId, s.deviceToken)).status).toBe(502);
    expect((await tokenRequest(s.sessionId, s.deviceToken)).status).toBe(200);
    // A demo session has 2 tokens; the failed one must not have used one up.
    expect((await tokenRequest(s.sessionId, s.deviceToken)).status).toBe(200);
  });

  // I-148: the daily voice budget (200 tokens a day, shared by everyone) was the only cap above one session, and new
  // sessions are free, so one address within its own per-IP limits spent the whole day's budget in minutes.
  it("I-148: one address staying inside its per-IP limits for 10 minutes leaves voice for everyone else", async () => {
    const t0 = Date.now();
    let now = t0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const from = (ip: string) => ({ "x-forwarded-for": ip });
    let issued = 0;
    let lastMinute = -1;
    for (let minute = 0; minute < 10; minute++) {
      now = t0 + minute * 61_000;
      // Each session: create (api + session), claim, then up to 6 tokens; stop at the first refusal this minute.
      for (let k = 0; k < 10; k++) {
        const created = await createSession(jsonRequest("/api/session", { kioskId: "malo" }, from("203.0.113.9")));
        if (created.status !== 200) break;
        const { sessionId, claimUrl } = (await created.json()) as { sessionId: string; claimUrl: string };
        const claimToken = new URL(claimUrl).hash.slice("#t=".length);
        const claimed = await claimRoute(jsonRequest("/api/session/claim", { sessionId, claimToken }, from("203.0.113.9")));
        if (claimed.status !== 200) break;
        const { deviceToken } = (await claimed.json()) as { deviceToken: string };
        let limited = false;
        for (let t = 0; t < 6; t++) {
          const res = await POST(jsonRequest("/api/live-token", { sessionId, locale: "en" }, { ...auth(deviceToken), ...from("203.0.113.9") }));
          if (res.status !== 200) {
            limited = true;
            break;
          }
          issued++;
          lastMinute = minute;
        }
        if (limited) break;
      }
    }
    // A judge on another address right after.
    const judge = (await read(await createSession(jsonRequest("/api/session", { kioskId: "malo", demo: true }, from("198.51.100.7"))))).body;
    const res = await read(await POST(jsonRequest("/api/live-token", { sessionId: judge.sessionId, locale: "en" }, { ...auth(judge.deviceToken), ...from("198.51.100.7") })));
    vi.restoreAllMocks();
    expect(res.status, `the judge's token request after one address got ${issued} tokens, the last in minute ${lastMinute + 1}`).toBe(200);
  });

  it("400 for a bad body or session id", async () => {
    const s = await demo();
    for (const b of [{ sessionId: "a/b", locale: "en" }, { sessionId: s.sessionId, locale: "fr" }, { sessionId: s.sessionId, locale: "en", x: 1 }]) {
      const { status } = await read(await POST(jsonRequest("/api/live-token", b, auth(s.deviceToken))));
      expect(status).toBe(400);
    }
  });
});
