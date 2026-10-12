import { ApiError, Modality, type GoogleGenAI } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getKiosk } from "@/lib/adapters/catalog";
import { CommandError } from "@/lib/commands/errors";
import { MemoryUsageStore, type UsageStore } from "@/lib/limits/usage";
import { claimSession, createSession, runCommand } from "@/lib/session/service";
import { MemoryStore } from "@/lib/store/memory";
import { geminiTokenIssuer, issueLiveToken, liveConfig, type LiveTokenIssuer } from "./live";

/** 2026-10-13 12:00 KST */
const T0 = Date.UTC(2026, 9, 13, 3, 0);
const HERO_LINE = { itemId: "cheese_burger", variant: "set", selections: { drink: ["zero_cola"] } };

let store: MemoryStore;
let usage: UsageStore;
let now: number;
let issued: Parameters<LiveTokenIssuer["create"]>[0][];
let issuer: LiveTokenIssuer;

beforeEach(() => {
  store = new MemoryStore();
  usage = new MemoryUsageStore();
  now = T0;
  issued = [];
  issuer = {
    async create(input) {
      issued.push(input);
      return { name: `auth_tokens/t${issued.length}` };
    },
  };
});
afterEach(() => vi.restoreAllMocks());

const deps = () => ({ store, usage, issuer, now: () => now });

async function demo() {
  const r = await createSession(store, { kioskId: "malo", demo: true }, T0);
  return { sessionId: r.sessionId, deviceToken: r.deviceToken!, kioskToken: r.kioskToken };
}

async function claimed() {
  const r = await createSession(store, { kioskId: "malo" }, T0);
  const { deviceToken } = await claimSession(store, { sessionId: r.sessionId, claimToken: r.claimToken }, T0);
  return { sessionId: r.sessionId, deviceToken, kioskToken: r.kioskToken };
}

const issue = (s: { sessionId: string }, bearer: string | null) =>
  issueLiveToken(deps(), { sessionId: s.sessionId, bearer, locale: "en" });

async function errorOf(p: Promise<unknown>): Promise<CommandError> {
  const e = await p.catch((x) => x);
  if (!(e instanceof CommandError)) throw new Error("expected a CommandError");
  return e;
}

let cid = 0;
function kiosk(s: { sessionId: string; kioskToken: string }, type: string, args: object = {}, extra: object = {}) {
  const body = { sessionId: s.sessionId, commandId: `k${++cid}`, type, args, source: "touch", ...extra };
  return runCommand(store, { body, bearer: s.kioskToken }, now);
}

describe("issueLiveToken", () => {
  it("demo: a one-use token for 3 min of voice; new sessions only in the next 60 s", async () => {
    const s = await demo();
    const out = await issue(s, s.deviceToken);
    expect(out).toEqual({ token: "auth_tokens/t1", model: "gemini-3.8-live", expiresAt: T0 + 180_000, voiceSeconds: 180 });
    expect(issued[0].expireTime).toBe(new Date(T0 + 180_000).toISOString());
    expect(issued[0].newSessionExpireTime).toBe(new Date(T0 + 60_000).toISOString());
  });

  it("a normal session gets 10 min", async () => {
    const s = await claimed();
    const out = await issue(s, s.deviceToken);
    expect(out.voiceSeconds).toBe(600);
    expect(out.expiresAt).toBe(T0 + 600_000);
    expect(issued[0].expireTime).toBe(new Date(T0 + 600_000).toISOString());
  });

  it("pins the model, the instructions with the menu and the current cart, and the 9 tools", async () => {
    const s = await demo();
    await kiosk(s, "addToCart", HERO_LINE);
    await issue(s, s.deviceToken);
    const { model, system, tools } = issued[0];
    expect(model).toBe("gemini-3.8-live");
    expect(system).toContain("<menu_data>");
    expect(system).toContain("Cart lines, already applied; do not add these again:");
    expect(system).toContain("cheese_burger");
    const [{ functionDeclarations }] = tools as { functionDeclarations: { name: string }[] }[];
    expect(functionDeclarations.map((d) => d.name).sort()).toEqual(
      [
        "addToCart",
        "callStaff",
        "confirmCheckout",
        "offerChoices",
        "removeFromCart",
        "requestCheckout",
        "setDineOption",
        "undoLastChange",
        "updateCart",
      ].sort(),
    );
  });

  it("the model id comes from GEMINI_LIVE_MODEL", async () => {
    vi.stubEnv("GEMINI_LIVE_MODEL", "gemini-3.1-flash-live-preview");
    try {
      const s = await demo();
      expect((await issue(s, s.deviceToken)).model).toBe("gemini-3.1-flash-live-preview");
      expect(issued[0].model).toBe("gemini-3.1-flash-live-preview");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("UNAUTHORIZED without a token, FORBIDDEN with the kiosk token; nothing issued", async () => {
    const s = await demo();
    expect((await errorOf(issue(s, null))).code).toBe("UNAUTHORIZED");
    expect((await errorOf(issue(s, s.kioskToken))).code).toBe("FORBIDDEN");
    expect(issued).toEqual([]);
  });

  it("NOT_FOUND for an unknown session", async () => {
    expect((await errorOf(issue({ sessionId: "x".repeat(22) }, "t"))).code).toBe("NOT_FOUND");
  });

  it("CONFLICT once the session is paying", async () => {
    const s = await demo();
    await kiosk(s, "setDineOption", { option: "eat_in" });
    const added = await kiosk(s, "addToCart", HERO_LINE);
    await kiosk(s, "requestCheckout");
    await kiosk(s, "confirmCheckout", {}, { cartVersion: added.cartVersion });
    expect((await errorOf(issue(s, s.deviceToken))).code).toBe("CONFLICT");
    expect(issued).toEqual([]);
  });

  it("GONE after the session expired", async () => {
    const s = await demo();
    now = T0 + 11 * 60_000;
    expect((await errorOf(issue(s, s.deviceToken))).code).toBe("GONE");
    expect(issued).toEqual([]);
  });

  it("RATE_LIMITED: the 3rd token of a demo session and the 7th of a normal one", async () => {
    const d = await demo();
    await issue(d, d.deviceToken);
    await issue(d, d.deviceToken);
    const e = await errorOf(issue(d, d.deviceToken));
    expect(e.code).toBe("RATE_LIMITED");
    expect(e.message).toBe("Voice is busy right now. Please type instead.");

    const n = await claimed();
    for (let i = 0; i < 6; i++) await issue(n, n.deviceToken);
    expect((await errorOf(issue(n, n.deviceToken))).code).toBe("RATE_LIMITED");
    expect(issued).toHaveLength(8);
  });

  it("RATE_LIMITED after 200 voice sessions in a day", async () => {
    for (let i = 0; i < 200; i++) await usage.bump("2026-10-13", "voiceSessions", 200);
    const s = await demo();
    const e = await errorOf(issue(s, s.deviceToken));
    expect(e.code).toBe("RATE_LIMITED");
    expect(issued).toEqual([]);
  });
});

describe("liveConfig", () => {
  it("builds the instructions in the requested language", () => {
    const k = getKiosk("malo");
    const ko = liveConfig(k, { cart: [], status: "connected", dineOption: null, locale: "ko" });
    expect(ko.system).toContain("The user's phone is set to Korean");
    expect(ko.system).toContain("Cart: empty");
  });
});

function fakeAi(create: (req: unknown) => Promise<unknown>) {
  return { authTokens: { create } } as unknown as GoogleGenAI;
}

const INPUT = {
  model: "gemini-3.8-live",
  system: "sys",
  tools: [{ functionDeclarations: [] }],
  expireTime: "2026-10-13T03:03:00.000Z",
  newSessionExpireTime: "2026-10-13T03:01:00.000Z",
};

describe("geminiTokenIssuer", () => {
  it("one use, times, and model, instructions, tools, audio and transcription pinned", async () => {
    const create = vi.fn().mockResolvedValue({ name: "auth_tokens/abc" });
    expect(await geminiTokenIssuer(fakeAi(create)).create(INPUT)).toEqual({ name: "auth_tokens/abc" });
    const { config } = create.mock.calls[0][0];
    expect(config.uses).toBe(1);
    expect(config.expireTime).toBe(INPUT.expireTime);
    expect(config.newSessionExpireTime).toBe(INPUT.newSessionExpireTime);
    // No lockAdditionalFields: with constraints set, every LiveConnectConfig field is locked (SDK docs, case 2).
    expect(config.lockAdditionalFields).toBeUndefined();
    expect(config.liveConnectConstraints).toEqual({
      model: "gemini-3.8-live",
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: "sys",
        tools: INPUT.tools,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    });
    expect(config.httpOptions).toEqual({ apiVersion: "v1alpha" });
  });

  it("a Gemini 429 is RATE_LIMITED with the plain message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const create = vi.fn().mockRejectedValue(new ApiError({ message: "quota for key AIza-secret", status: 429 }));
    const e = await errorOf(geminiTokenIssuer(fakeAi(create)).create(INPUT));
    expect(e.code).toBe("RATE_LIMITED");
    expect(e.message).toBe("Voice is busy right now. Please type instead.");
  });

  it("other errors are UPSTREAM; the upstream message is neither returned nor logged", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const create = vi.fn().mockRejectedValue(new ApiError({ message: "bad key AIza-secret", status: 400 }));
    const e = await errorOf(geminiTokenIssuer(fakeAi(create)).create(INPUT));
    expect(e.code).toBe("UPSTREAM");
    expect(e.message).not.toContain("AIza");
    expect(JSON.stringify(log.mock.calls)).not.toContain("AIza");
  });

  it("without GEMINI_API_KEY the real client is UPSTREAM with the plain message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("GEMINI_API_KEY", "");
    try {
      const e = await errorOf(geminiTokenIssuer().create(INPUT));
      expect(e).toMatchObject({ code: "UPSTREAM", message: "Voice is not available right now. Please type instead." });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("a reply without a token name is UPSTREAM", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const create = vi.fn().mockResolvedValue({});
    expect((await errorOf(geminiTokenIssuer(fakeAi(create)).create(INPUT))).code).toBe("UPSTREAM");
  });
});
