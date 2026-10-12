import { describe, expect, it, vi } from "vitest";
import { createDeepHealth, type DeepHealthDeps } from "./health";

const ALL_OK = { store: "ok", textModel: "ok", liveModel: "ok", textGenerate: "ok", keyGenerate: "ok", liveToken: "ok" };
const ONE_TOKEN = { model: "text-model", contents: "Reply with OK", config: { maxOutputTokens: 1 } };

function deps(over: Partial<DeepHealthDeps> = {}): DeepHealthDeps {
  return {
    store: () => ({ get: vi.fn().mockResolvedValue(null) }),
    api: () => ({ get: vi.fn().mockResolvedValue({ name: "m" }), generateContent: vi.fn().mockResolvedValue({}) }),
    text: () => ({ generateContent: vi.fn().mockResolvedValue({}) }),
    liveTokens: () => ({ create: vi.fn().mockResolvedValue({ name: "auth_tokens/t" }) }),
    textModel: "text-model",
    liveModel: "live-model",
    now: () => 0,
    ...over,
  };
}

const billing = () => Promise.reject(Object.assign(new Error("credits"), { status: 402 }));

describe("deep health", () => {
  it("all checks pass → ok; both model ids are looked up on the Gemini API", async () => {
    const get = vi.fn().mockResolvedValue({ name: "m" });
    const check = createDeepHealth(deps({ api: () => ({ get, generateContent: vi.fn().mockResolvedValue({}) }) }));
    expect(await check()).toEqual({ ok: true, checks: ALL_OK });
    expect(get.mock.calls.map((c) => c[0].model)).toEqual(["text-model", "live-model"]);
  });

  it("textGenerate and keyGenerate each ask their backend for one output token", async () => {
    const textGen = vi.fn().mockResolvedValue({});
    const keyGen = vi.fn().mockResolvedValue({});
    await createDeepHealth(
      deps({ text: () => ({ generateContent: textGen }), api: () => ({ get: vi.fn().mockResolvedValue({}), generateContent: keyGen }) }),
    )();
    expect(textGen).toHaveBeenCalledWith(ONE_TOKEN);
    expect(keyGen).toHaveBeenCalledWith(ONE_TOKEN);
  });

  it("liveToken creates a one-use token that expires in 60 s and discards it", async () => {
    const create = vi.fn().mockResolvedValue({ name: "auth_tokens/t" });
    const result = await createDeepHealth(deps({ liveTokens: () => ({ create }), now: () => Date.UTC(2026, 9, 13) }))();
    const exp = new Date(Date.UTC(2026, 9, 13) + 60_000).toISOString();
    expect(create).toHaveBeenCalledWith({
      config: { uses: 1, expireTime: exp, newSessionExpireTime: exp, httpOptions: { apiVersion: "v1alpha" } },
    });
    expect(JSON.stringify(result)).not.toContain("auth_tokens");
  });

  it("key credits used up (seen 10-13): keyGenerate fails while lookups, tokens and Vertex text still pass", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const check = createDeepHealth(deps({ api: () => ({ get: vi.fn().mockResolvedValue({}), generateContent: billing }) }));
    expect(await check()).toEqual({ ok: false, checks: { ...ALL_OK, keyGenerate: "fail" } });
    expect(log).toHaveBeenCalledWith("health keyGenerate:", "Error 402");
  });

  it("text backend billing failure fails textGenerate only", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const check = createDeepHealth(deps({ text: () => ({ generateContent: billing }) }));
    expect(await check()).toEqual({ ok: false, checks: { ...ALL_OK, textGenerate: "fail" } });
  });

  it("a token reply without a name fails liveToken", async () => {
    const check = createDeepHealth(deps({ liveTokens: () => ({ create: vi.fn().mockResolvedValue({}) }) }));
    expect((await check()).checks.liveToken).toBe("fail");
  });

  it("a model lookup failure → not ok, only that check fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const get = vi.fn(async ({ model }: { model: string }) => {
      if (model === "live-model") throw new Error("404");
      return { name: model };
    });
    const check = createDeepHealth(deps({ api: () => ({ get, generateContent: vi.fn().mockResolvedValue({}) }) }));
    expect(await check()).toEqual({ ok: false, checks: { ...ALL_OK, liveModel: "fail" } });
  });

  it("a store that returns a session for the probe id, or throws, fails the store check", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const found = createDeepHealth(deps({ store: () => ({ get: vi.fn().mockResolvedValue({}) }) }));
    expect((await found()).checks.store).toBe("fail");
    const thrown = createDeepHealth(
      deps({
        store: () => {
          throw new Error("STORE=memory refused");
        },
      }),
    );
    expect((await thrown()).checks.store).toBe("fail");
  });

  it("no API key: every key check fails, the Vertex text check still passes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const noKey = () => {
      throw new Error("no key");
    };
    const check = createDeepHealth(deps({ api: noKey, liveTokens: noKey }));
    expect(await check()).toEqual({
      ok: false,
      checks: { store: "ok", textModel: "fail", liveModel: "fail", textGenerate: "ok", keyGenerate: "fail", liveToken: "fail" },
    });
  });

  it("a check that hangs fails after the timeout", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const hang = () => new Promise<never>(() => {});
    const check = createDeepHealth(
      deps({
        api: () => ({ get: hang, generateContent: hang }),
        text: () => ({ generateContent: hang }),
        liveTokens: () => ({ create: hang }),
        timeoutMs: 10,
      }),
    );
    expect(await check()).toEqual({
      ok: false,
      checks: { store: "ok", textModel: "fail", liveModel: "fail", textGenerate: "fail", keyGenerate: "fail", liveToken: "fail" },
    });
  });

  it("caches the result for 60 s", async () => {
    let t = 0;
    const generateContent = vi.fn().mockResolvedValue({});
    const check = createDeepHealth(deps({ text: () => ({ generateContent }), now: () => t }));
    await check();
    t = 59_999;
    await check();
    expect(generateContent).toHaveBeenCalledTimes(1);
    t = 60_000;
    await check();
    expect(generateContent).toHaveBeenCalledTimes(2);
  });
});
