import { describe, expect, it, vi } from "vitest";
import { createDeepHealth, type DeepHealthDeps } from "./health";

function deps(over: Partial<DeepHealthDeps> = {}): DeepHealthDeps {
  return {
    store: () => ({ get: vi.fn().mockResolvedValue(null) }),
    models: () => ({ get: vi.fn().mockResolvedValue({ name: "m" }) }),
    textModel: "text-model",
    liveModel: "live-model",
    now: () => 0,
    ...over,
  };
}

describe("deep health", () => {
  it("all checks pass → ok, and both model ids are asked for", async () => {
    const get = vi.fn().mockResolvedValue({ name: "m" });
    const check = createDeepHealth(deps({ models: () => ({ get }) }));
    expect(await check()).toEqual({ ok: true, checks: { store: "ok", textModel: "ok", liveModel: "ok" } });
    expect(get.mock.calls.map((c) => c[0].model)).toEqual(["text-model", "live-model"]);
  });

  it("a model failure → not ok, only that check fails", async () => {
    const get = vi.fn(async ({ model }: { model: string }) => {
      if (model === "live-model") throw new Error("404");
      return { name: model };
    });
    const check = createDeepHealth(deps({ models: () => ({ get }) }));
    expect(await check()).toEqual({ ok: false, checks: { store: "ok", textModel: "ok", liveModel: "fail" } });
  });

  it("a store that returns a session for the probe id, or throws, fails the store check", async () => {
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

  it("a missing model client (no API key) fails both model checks", async () => {
    const check = createDeepHealth(
      deps({
        models: () => {
          throw new Error("no key");
        },
      }),
    );
    expect(await check()).toEqual({ ok: false, checks: { store: "ok", textModel: "fail", liveModel: "fail" } });
  });

  it("a check that hangs fails after the timeout", async () => {
    const check = createDeepHealth(deps({ models: () => ({ get: () => new Promise(() => {}) }), timeoutMs: 10 }));
    expect(await check()).toEqual({ ok: false, checks: { store: "ok", textModel: "fail", liveModel: "fail" } });
  });

  it("caches the result for 60 s", async () => {
    let t = 0;
    const get = vi.fn().mockResolvedValue({ name: "m" });
    const check = createDeepHealth(deps({ models: () => ({ get }), now: () => t }));
    await check();
    t = 59_999;
    await check();
    expect(get).toHaveBeenCalledTimes(2);
    t = 60_000;
    await check();
    expect(get).toHaveBeenCalledTimes(4);
  });
});
