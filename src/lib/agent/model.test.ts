import { ApiError, type GoogleGenAI } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { CommandError } from "@/lib/commands/errors";
import { createCircuit, geminiClient, textBackendSetting, textClientOptions, tokenUsage, type TextDeps } from "./model";

describe("tokenUsage", () => {
  it("reads generateContent and Live usage, missing counts are 0, no metadata is undefined", () => {
    expect(tokenUsage({ promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 })).toEqual({
      prompt: 10,
      cached: 0,
      candidates: 2,
      thoughts: 0,
      total: 12,
    });
    // Live messages name the output count responseTokenCount.
    expect(
      tokenUsage({ promptTokenCount: 10, cachedContentTokenCount: 8, responseTokenCount: 5, thoughtsTokenCount: 1, totalTokenCount: 16 }),
    ).toEqual({ prompt: 10, cached: 8, candidates: 5, thoughts: 1, total: 16 });
    expect(tokenUsage(undefined)).toBeUndefined();
  });
});

describe("textBackendSetting", () => {
  it("defaults to auto; api and vertex pin one backend; anything else is auto", () => {
    try {
      vi.stubEnv("GEMINI_TEXT_BACKEND", "");
      expect(textBackendSetting()).toBe("auto");
      vi.stubEnv("GEMINI_TEXT_BACKEND", "api");
      expect(textBackendSetting()).toBe("api");
      vi.stubEnv("GEMINI_TEXT_BACKEND", "vertex");
      expect(textBackendSetting()).toBe("vertex");
      vi.stubEnv("GEMINI_TEXT_BACKEND", "other");
      expect(textBackendSetting()).toBe("auto");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("textClientOptions", () => {
  it("Vertex AI uses application default credentials: project kibo-2026, location global, no key", () => {
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", "");
    vi.stubEnv("GEMINI_VERTEX_LOCATION", "");
    vi.stubEnv("GEMINI_API_KEY", "key-that-must-not-be-used");
    try {
      expect(textClientOptions("vertex")).toEqual({ vertexai: true, project: "kibo-2026", location: "global" });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("Vertex project and location come from GOOGLE_CLOUD_PROJECT and GEMINI_VERTEX_LOCATION", () => {
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", "other-project");
    vi.stubEnv("GEMINI_VERTEX_LOCATION", "asia-northeast3");
    try {
      expect(textClientOptions("vertex")).toEqual({ vertexai: true, project: "other-project", location: "asia-northeast3" });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("the API backend uses the Gemini API key; without a key it throws", () => {
    vi.stubEnv("GEMINI_API_KEY", "k");
    try {
      expect(textClientOptions("api")).toEqual({ apiKey: "k" });
      vi.stubEnv("GEMINI_API_KEY", "");
      expect(() => textClientOptions("api")).toThrow("GEMINI_API_KEY is not set");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

const REQ = { system: "sys", contents: [{ role: "user" as const, parts: [{ text: "hi" }] }], tools: [] };

function fakeAi(generateContent: (req: unknown) => Promise<unknown>) {
  return { models: { generateContent } } as unknown as GoogleGenAI;
}

/** One fixed backend, no fallback: for tests of the reply handling. */
function on(ai: GoogleGenAI) {
  return geminiClient({ backend: "api", models: () => ai.models });
}

describe("geminiClient", () => {
  it("returns the model content unchanged, its function calls and only non-thought text", async () => {
    const content = {
      role: "model",
      parts: [
        { text: "thinking", thought: true },
        { functionCall: { id: "c1", name: "addToCart", args: { itemId: "cola" } }, thoughtSignature: "sig" },
        { text: "Added." },
      ],
    };
    const generate = vi.fn().mockResolvedValue({ candidates: [{ content }], functionCalls: [content.parts[1].functionCall] });
    const out = await on(fakeAi(generate)).generate(REQ);
    expect(out.content).toEqual(content);
    expect(out.content.parts).toBe(content.parts);
    expect(out.functionCalls).toEqual([{ id: "c1", name: "addToCart", args: { itemId: "cola" } }]);
    expect(out.text).toBe("Added.");
    expect(out.backend).toBe("api");
    const sent = generate.mock.calls[0][0];
    expect(sent.contents).toBe(REQ.contents);
    expect(sent.config.systemInstruction).toBe("sys");
    expect(sent.config.maxOutputTokens).toBeLessThanOrEqual(2048);
  });

  it("thinking level comes from GEMINI_TEXT_THINKING (default low); temperature stays the model default", async () => {
    const generate = vi.fn().mockResolvedValue({ candidates: [] });
    const saved = process.env.GEMINI_TEXT_THINKING;
    try {
      delete process.env.GEMINI_TEXT_THINKING;
      await on(fakeAi(generate)).generate(REQ);
      process.env.GEMINI_TEXT_THINKING = "high";
      await on(fakeAi(generate)).generate(REQ);
      process.env.GEMINI_TEXT_THINKING = "minimal";
      await on(fakeAi(generate)).generate(REQ);
    } finally {
      if (saved === undefined) delete process.env.GEMINI_TEXT_THINKING;
      else process.env.GEMINI_TEXT_THINKING = saved;
    }
    const configs = generate.mock.calls.map((c) => c[0].config);
    expect(configs.map((c) => c.thinkingConfig)).toEqual([{ thinkingLevel: "LOW" }, { thinkingLevel: "HIGH" }, { thinkingLevel: "LOW" }]);
    expect(configs[0]).not.toHaveProperty("temperature");
  });

  it("returns the call's token counts from usageMetadata, numbers only", async () => {
    const usageMetadata = { promptTokenCount: 900, candidatesTokenCount: 40, thoughtsTokenCount: 60, totalTokenCount: 1000 };
    const out = await on(fakeAi(async () => ({ candidates: [], usageMetadata }))).generate(REQ);
    expect(out.usage).toEqual({ prompt: 900, cached: 0, candidates: 40, thoughts: 60, total: 1000 });
  });

  it("an empty answer is an empty model turn", async () => {
    const out = await on(fakeAi(async () => ({ candidates: [] }))).generate(REQ);
    expect(out).toEqual({ content: { role: "model", parts: [] }, functionCalls: [], text: "", backend: "api" });
  });

  it("a candidate whose content has no parts is an empty model turn", async () => {
    const out = await on(fakeAi(async () => ({ candidates: [{ content: { role: "model" } }] }))).generate(REQ);
    expect(out).toEqual({ content: { role: "model", parts: [] }, functionCalls: [], text: "", backend: "api" });
  });

  it("HTTP 429 → RATE_LIMITED; anything else → UPSTREAM; never the upstream message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const limited = on(fakeAi(async () => Promise.reject(new ApiError({ message: "quota secret", status: 429 }))));
    const err = await limited.generate(REQ).catch((e) => e);
    expect(err).toBeInstanceOf(CommandError);
    expect(err).toMatchObject({ code: "RATE_LIMITED", message: "Please try again in a moment." });

    const broken = on(fakeAi(async () => Promise.reject(new Error("model said secret"))));
    const err2 = await broken.generate(REQ).catch((e) => e);
    expect(err2).toMatchObject({ code: "UPSTREAM" });
    expect(err2.message).not.toContain("secret");
  });

  it("HTTP 402 (prepaid credits used up) → UPSTREAM, logged as a billing error without the body", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const billing = on(fakeAi(async () => Promise.reject(new ApiError({ message: "credits for AIza-secret", status: 402 }))));
    const err = await billing.generate(REQ).catch((e) => e);
    expect(err).toMatchObject({
      code: "UPSTREAM",
      message: "The assistant is not available right now. Please use the buttons or try again.",
    });
    expect(log).toHaveBeenCalledWith("gemini billing error (402)");
    expect(JSON.stringify(log.mock.calls)).not.toContain("AIza");
  });

  it("with GEMINI_TEXT_BACKEND=api and no GEMINI_API_KEY the real client is UPSTREAM with the plain message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("GEMINI_TEXT_BACKEND", "api");
    vi.stubEnv("GEMINI_API_KEY", "");
    try {
      const err = await geminiClient().generate(REQ).catch((e) => e);
      expect(err).toBeInstanceOf(CommandError);
      expect(err).toMatchObject({
        code: "UPSTREAM",
        message: "The assistant is not available right now. Please use the buttons or try again.",
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

const OK = { candidates: [{ content: { role: "model", parts: [{ text: "ok" }] } }] };
const apiError = (status: number) => new ApiError({ message: `body AIza-secret ${status}`, status });

/** Auto mode with fake API-key and Vertex clients, a fresh circuit and a fake clock. */
function auto(api: (req: unknown) => Promise<unknown>, opts: { circuit?: TextDeps["circuit"]; now?: () => number } = {}) {
  const apiGen = vi.fn(api);
  const vertexGen = vi.fn(async () => OK);
  const deps: Partial<TextDeps> = {
    backend: "auto",
    models: (b) => ({ generateContent: b === "api" ? apiGen : vertexGen }) as unknown as GoogleGenAI["models"],
    circuit: opts.circuit ?? createCircuit(),
    now: opts.now ?? (() => 0),
  };
  return { apiGen, vertexGen, deps, client: () => geminiClient(deps) };
}

describe("geminiClient, GEMINI_TEXT_BACKEND=auto", () => {
  it("API ok → no Vertex call", async () => {
    const t = auto(async () => OK);
    const out = await t.client().generate(REQ);
    expect(out.text).toBe("ok");
    expect(out.backend).toBe("api");
    expect(t.apiGen).toHaveBeenCalledTimes(1);
    expect(t.vertexGen).not.toHaveBeenCalled();
  });

  it("API 402 → the same request once on Vertex, logged with the status only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = auto(async () => Promise.reject(apiError(402)));
    const out = await t.client().generate(REQ);
    expect(out.backend).toBe("vertex");
    expect(t.vertexGen).toHaveBeenCalledTimes(1);
    expect(t.vertexGen.mock.calls[0]).toEqual(t.apiGen.mock.calls[0]);
    expect(log).toHaveBeenCalledWith("gemini text fallback api->vertex (402)");
    expect(JSON.stringify(log.mock.calls)).not.toContain("AIza");
  });

  it("429, 5xx and network errors also fall back once", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const e of [apiError(429), apiError(503), new TypeError("fetch failed")]) {
      const t = auto(async () => Promise.reject(e));
      expect((await t.client().generate(REQ)).backend).toBe("vertex");
      expect(t.vertexGen).toHaveBeenCalledTimes(1);
    }
  });

  it("API 400 (bad request) → no fallback, the error surfaces", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = auto(async () => Promise.reject(apiError(400)));
    const err = await t.client().generate(REQ).catch((e) => e);
    expect(err).toMatchObject({ code: "UPSTREAM" });
    expect(t.vertexGen).not.toHaveBeenCalled();
  });

  it("retries once only: when Vertex fails too, its error surfaces", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = auto(async () => Promise.reject(apiError(503)));
    t.vertexGen.mockRejectedValue(apiError(429));
    const err = await t.client().generate(REQ).catch((e) => e);
    expect(err).toMatchObject({ code: "RATE_LIMITED" });
    expect(t.apiGen).toHaveBeenCalledTimes(1);
    expect(t.vertexGen).toHaveBeenCalledTimes(1);
  });

  it("one request stays on one backend: after a call succeeded, a later failure is not retried elsewhere", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Round 1 on the API key; tools ran; round 2 fails with 503 → no Vertex call, error surfaces.
    const t = auto(async () => OK);
    const client = t.client();
    await client.generate(REQ);
    t.apiGen.mockRejectedValueOnce(apiError(503));
    expect(await client.generate(REQ).catch((e) => e)).toMatchObject({ code: "UPSTREAM" });
    expect(t.vertexGen).not.toHaveBeenCalled();

    // Round 1 fell back to Vertex; round 2 goes to Vertex directly.
    const f = auto(async () => Promise.reject(apiError(402)));
    const c2 = f.client();
    await c2.generate(REQ);
    await c2.generate(REQ);
    expect(f.apiGen).toHaveBeenCalledTimes(1);
    expect(f.vertexGen).toHaveBeenCalledTimes(2);
  });

  it("circuit: after 3 × 402 within 5 min, Vertex directly for the next 10 min, then the API key again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let now = 0;
    const circuit = createCircuit();
    const t = auto(async () => Promise.reject(apiError(402)), { circuit, now: () => now });
    for (const at of [0, 60_000, 4 * 60_000]) {
      now = at;
      await t.client().generate(REQ);
    }
    expect(t.apiGen).toHaveBeenCalledTimes(3);

    now = 4 * 60_000 + 9 * 60_000;
    await t.client().generate(REQ);
    expect(t.apiGen).toHaveBeenCalledTimes(3);
    expect(t.vertexGen).toHaveBeenCalledTimes(4);

    t.apiGen.mockImplementation(async () => OK);
    now = 4 * 60_000 + 10 * 60_000;
    expect((await t.client().generate(REQ)).backend).toBe("api");
    expect(t.apiGen).toHaveBeenCalledTimes(4);
  });

  it("circuit: 402s spread over more than 5 min, or 429s and 5xx, do not open it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let now = 0;
    const spread = auto(async () => Promise.reject(apiError(402)), { now: () => now });
    for (const at of [0, 3 * 60_000, 6 * 60_000]) {
      now = at;
      await spread.client().generate(REQ);
    }
    now = 6 * 60_000 + 1;
    await spread.client().generate(REQ);
    expect(spread.apiGen).toHaveBeenCalledTimes(4);

    const busy = auto(async () => Promise.reject(apiError(429)));
    for (let i = 0; i < 4; i++) await busy.client().generate(REQ);
    expect(busy.apiGen).toHaveBeenCalledTimes(4);
  });

  it("GEMINI_TEXT_BACKEND=vertex never touches the API key", async () => {
    const t = auto(async () => OK);
    const out = await geminiClient({ ...t.deps, backend: "vertex" }).generate(REQ);
    expect(out.backend).toBe("vertex");
    expect(t.apiGen).not.toHaveBeenCalled();
  });
});
