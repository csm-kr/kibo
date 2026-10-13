import { ApiError } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { CommandError } from "@/lib/commands/errors";
import { resetLimits } from "@/lib/limits/ip";
import { MemoryUsageStore, type UsageStore } from "@/lib/limits/usage";
import { claimSession, createSession } from "@/lib/session/service";
import { MemoryStore } from "@/lib/store/memory";
import { geminiTokenIssuer, KeyUnavailableError, type LiveTokenIssuer } from "./live";
import { createKeyHealth, liveBackendSetting, relayHealthzUrl, startLiveVoice, voiceRelayUrl, type KeyHealth } from "./liveBackend";

const T0 = Date.UTC(2026, 9, 13, 9, 0);
const RELAY = "wss://kibo-voice.example.run.app/ws";

let store: MemoryStore;
let usage: UsageStore;
let now: number;
let issuer: { create: Mock<LiveTokenIssuer["create"]> };
let key: { usable: Mock<KeyHealth["usable"]>; failed: Mock<KeyHealth["failed"]> };

beforeEach(() => {
  resetLimits();
  store = new MemoryStore();
  usage = new MemoryUsageStore();
  now = T0;
  issuer = { create: vi.fn<LiveTokenIssuer["create"]>().mockResolvedValue({ name: "auth_tokens/t1" }) };
  key = { usable: vi.fn<KeyHealth["usable"]>().mockResolvedValue(true), failed: vi.fn<KeyHealth["failed"]>() };
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function claimed() {
  const r = await createSession(store, { kioskId: "malo" }, T0);
  const { deviceToken } = await claimSession(store, { sessionId: r.sessionId, claimToken: r.claimToken }, T0);
  return { sessionId: r.sessionId, deviceToken };
}

function start(s: { sessionId: string }, bearer: string | null, backend: "auto" | "api" | "vertex", relayUrl: string | null = RELAY) {
  return startLiveVoice(
    { store, usage, issuer, now: () => now, backend, relayUrl, key },
    { sessionId: s.sessionId, bearer, locale: "ko", ip: "192.0.2.1" },
  );
}

async function errorOf(p: Promise<unknown>): Promise<CommandError> {
  const e = await p.catch((x) => x);
  if (!(e instanceof CommandError)) throw new Error("expected a CommandError");
  return e;
}

const liveTokenCount = async (id: string) => (await store.transact(id, (_s, sec) => ({ value: sec?.liveTokenCount ?? 0 })));

describe("liveBackendSetting and voiceRelayUrl", () => {
  it("GEMINI_LIVE_BACKEND: auto by default, api and vertex pin one; anything else is auto", () => {
    expect(liveBackendSetting()).toBe("auto");
    vi.stubEnv("GEMINI_LIVE_BACKEND", "vertex");
    expect(liveBackendSetting()).toBe("vertex");
    vi.stubEnv("GEMINI_LIVE_BACKEND", "api");
    expect(liveBackendSetting()).toBe("api");
    vi.stubEnv("GEMINI_LIVE_BACKEND", "openai");
    expect(liveBackendSetting()).toBe("auto");
  });

  it("VOICE_RELAY_URL must be a ws(s) URL; anything else counts as not set", () => {
    expect(voiceRelayUrl()).toBeNull();
    vi.stubEnv("VOICE_RELAY_URL", RELAY);
    expect(voiceRelayUrl()).toBe(RELAY);
    vi.stubEnv("VOICE_RELAY_URL", "ws://localhost:3111/ws");
    expect(voiceRelayUrl()).toBe("ws://localhost:3111/ws");
    for (const bad of ["https://kibo-voice.example/ws", "not a url", "javascript:alert(1)"]) {
      vi.stubEnv("VOICE_RELAY_URL", bad);
      expect(voiceRelayUrl()).toBeNull();
    }
  });

  it("the relay's health URL is /healthz on the same host over http(s)", () => {
    expect(relayHealthzUrl(RELAY)).toBe("https://kibo-voice.example.run.app/healthz");
    expect(relayHealthzUrl("ws://localhost:3111/ws")).toBe("http://localhost:3111/healthz");
  });
});

describe("startLiveVoice", () => {
  it("auto with a working key: a direct token, as before", async () => {
    const s = await claimed();
    const out = await start(s, s.deviceToken, "auto");
    expect(out).toMatchObject({ mode: "direct", token: "auth_tokens/t1", model: "gemini-3.8-live", voiceSeconds: 600 });
    expect(await liveTokenCount(s.sessionId)).toBe(1);
  });

  it("vertex: the relay URL only; nothing is counted here (the relay counts) and no token is made", async () => {
    const s = await claimed();
    const out = await start(s, s.deviceToken, "vertex");
    expect(out).toEqual({ mode: "relay", url: RELAY });
    expect(issuer.create).not.toHaveBeenCalled();
    expect(key.usable).not.toHaveBeenCalled();
    expect(await liveTokenCount(s.sessionId)).toBe(0);
    // No instructions, tools or keys in the reply.
    expect(JSON.stringify(out)).not.toContain("menu_data");
  });

  it("relay mode still refuses what the relay would: no token, the kiosk's token, paying, expired", async () => {
    const r = await createSession(store, { kioskId: "malo" }, T0);
    const { deviceToken } = await claimSession(store, { sessionId: r.sessionId, claimToken: r.claimToken }, T0);
    expect((await errorOf(start(r, null, "vertex"))).code).toBe("UNAUTHORIZED");
    expect((await errorOf(start(r, r.kioskToken, "vertex"))).code).toBe("FORBIDDEN");
    now = T0 + 11 * 60_000;
    expect((await errorOf(start(r, deviceToken, "vertex"))).code).toBe("GONE");
  });

  it("relay mode refuses a session whose token budget is spent, without counting", async () => {
    const s = await claimed();
    for (let i = 0; i < 6; i++) await start(s, s.deviceToken, "api");
    expect((await errorOf(start(s, s.deviceToken, "vertex"))).code).toBe("RATE_LIMITED");
    expect(await liveTokenCount(s.sessionId)).toBe(6);
  });

  it("vertex without a relay URL: UPSTREAM, voice is not available", async () => {
    const s = await claimed();
    const e = await errorOf(start(s, s.deviceToken, "vertex", null));
    expect(e.code).toBe("UPSTREAM");
  });

  it("auto when the key probe says the key cannot generate (402): the relay, no token", async () => {
    key.usable.mockResolvedValue(false);
    const s = await claimed();
    expect(await start(s, s.deviceToken, "auto")).toEqual({ mode: "relay", url: RELAY });
    expect(issuer.create).not.toHaveBeenCalled();
    expect(await liveTokenCount(s.sessionId)).toBe(0);
  });

  it("auto when the token issuer reports the key unusable: the relay, the count given back, the key marked down", async () => {
    issuer.create.mockRejectedValue(new KeyUnavailableError());
    const s = await claimed();
    expect(await start(s, s.deviceToken, "auto")).toEqual({ mode: "relay", url: RELAY });
    expect(key.failed).toHaveBeenCalledTimes(1);
    expect(await liveTokenCount(s.sessionId)).toBe(0);
  });

  it("auto without a relay URL: direct even when the key is down (nothing to fall back to)", async () => {
    key.usable.mockResolvedValue(false);
    const s = await claimed();
    expect((await start(s, s.deviceToken, "auto", null)).mode).toBe("direct");
    expect(key.usable).not.toHaveBeenCalled();
  });

  it("api: direct only, a key error stays an error", async () => {
    issuer.create.mockRejectedValue(new KeyUnavailableError());
    const s = await claimed();
    expect((await errorOf(start(s, s.deviceToken, "api"))).code).toBe("UPSTREAM");
    expect(key.usable).not.toHaveBeenCalled();
  });

  it("auto: other token errors (429) are not a reason to switch", async () => {
    issuer.create.mockRejectedValue(new CommandError("RATE_LIMITED", "Voice is busy right now. Please type instead."));
    const s = await claimed();
    expect((await errorOf(start(s, s.deviceToken, "auto"))).code).toBe("RATE_LIMITED");
    expect(key.failed).not.toHaveBeenCalled();
  });
});

describe("geminiTokenIssuer key errors", () => {
  const input = { model: "m", system: "s", tools: [], languageCode: "ko-KR", expireTime: "x", newSessionExpireTime: "y" };

  it("402 and a missing key are KeyUnavailableError (an UPSTREAM CommandError); 429 is not", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fails = (e: unknown) => geminiTokenIssuer({ authTokens: { create: vi.fn().mockRejectedValue(e) } } as never).create(input);
    const billing = await fails(new ApiError({ message: "credits", status: 402 })).catch((x) => x);
    expect(billing).toBeInstanceOf(KeyUnavailableError);
    expect(billing.code).toBe("UPSTREAM");
    const busy = await fails(new ApiError({ message: "busy", status: 429 })).catch((x) => x);
    expect(busy).not.toBeInstanceOf(KeyUnavailableError);
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(await geminiTokenIssuer().create(input).catch((x) => x)).toBeInstanceOf(KeyUnavailableError);
  });
});

describe("createKeyHealth", () => {
  it("probes once and caches an ok for 60 s; concurrent callers share one probe", async () => {
    let t = 0;
    const probe = vi.fn().mockResolvedValue(undefined);
    const health = createKeyHealth({ probe, now: () => t });
    expect(await Promise.all([health.usable(), health.usable()])).toEqual([true, true]);
    expect(probe).toHaveBeenCalledTimes(1);
    t = 59_000;
    await health.usable();
    expect(probe).toHaveBeenCalledTimes(1);
    t = 60_000;
    await health.usable();
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("402 or no key: down for 10 min, then probed again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let t = 0;
    const probe = vi.fn().mockRejectedValue(Object.assign(new Error("credits"), { status: 402 }));
    const health = createKeyHealth({ probe, now: () => t });
    expect(await health.usable()).toBe(false);
    t = 9 * 60_000;
    expect(await health.usable()).toBe(false);
    expect(probe).toHaveBeenCalledTimes(1);
    t = 10 * 60_000;
    probe.mockResolvedValue(undefined);
    expect(await health.usable()).toBe(true);

    const noKey = createKeyHealth({ probe: vi.fn().mockRejectedValue(new Error("GEMINI_API_KEY is not set")), now: () => 0 });
    expect(await noKey.usable()).toBe(false);
  });

  it("other probe errors (429, 5xx, network, timeout) say nothing about billing: usable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const e of [Object.assign(new Error("busy"), { status: 429 }), Object.assign(new Error("down"), { status: 503 }), new TypeError("fetch failed")]) {
      expect(await createKeyHealth({ probe: vi.fn().mockRejectedValue(e), now: () => 0 }).usable()).toBe(true);
    }
    const hang = createKeyHealth({ probe: () => new Promise(() => {}), now: () => 0, timeoutMs: 5 });
    expect(await hang.usable()).toBe(true);
  });

  it("failed() marks the key down for 10 min without a probe", async () => {
    let t = 0;
    const probe = vi.fn().mockResolvedValue(undefined);
    const health = createKeyHealth({ probe, now: () => t });
    health.failed();
    expect(await health.usable()).toBe(false);
    expect(probe).not.toHaveBeenCalled();
    t = 10 * 60_000;
    expect(await health.usable()).toBe(true);
  });
});
