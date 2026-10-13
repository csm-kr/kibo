import { ApiError } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPromptCache, type CacheApi } from "./cache";

const TOOLS = [{ functionDeclarations: [{ name: "addToCart" }] }];
let t: number;
let n: number;
let create: ReturnType<typeof vi.fn<CacheApi["create"]>>;

beforeEach(() => {
  t = 0;
  n = 0;
  create = vi.fn<CacheApi["create"]>(async () => ({ name: `cachedContents/c${++n}` }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const cacheOn = () => createPromptCache(() => ({ create }), () => t);

describe("createPromptCache", () => {
  it("creates one cache per backend, model and static prompt, with the instructions, tools and a 60 min TTL", async () => {
    const cache = cacheOn();
    expect(await cache.get("api", "m", "rules A", TOOLS)).toBe("cachedContents/c1");
    expect(await cache.get("api", "m", "rules A", TOOLS)).toBe("cachedContents/c1");
    expect(await cache.get("api", "m", "rules B", TOOLS)).toBe("cachedContents/c2");
    expect(await cache.get("vertex", "m", "rules A", TOOLS)).toBe("cachedContents/c3");
    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls[0][0]).toEqual({
      model: "m",
      config: { systemInstruction: "rules A", tools: TOOLS, ttl: "3600s", displayName: "kibo-text-agent" },
    });
  });

  it("requests at the same moment share one create", async () => {
    const cache = cacheOn();
    const names = await Promise.all([1, 2, 3].map(() => cache.get("api", "m", "rules", TOOLS)));
    expect(names).toEqual(["cachedContents/c1", "cachedContents/c1", "cachedContents/c1"]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("makes a new cache 5 min before the old one expires", async () => {
    const cache = cacheOn();
    await cache.get("api", "m", "rules", TOOLS);
    t = 54 * 60_000;
    expect(await cache.get("api", "m", "rules", TOOLS)).toBe("cachedContents/c1");
    t = 55 * 60_000;
    expect(await cache.get("api", "m", "rules", TOOLS)).toBe("cachedContents/c2");
  });

  it("when the backend refuses, logs one line, answers null and tries again only after 10 min", async () => {
    create.mockRejectedValueOnce(new ApiError({ message: "too small: request body here", status: 400 }));
    const cache = cacheOn();
    expect(await cache.get("api", "m", "rules", TOOLS)).toBeNull();
    t = 9 * 60_000;
    expect(await cache.get("api", "m", "rules", TOOLS)).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith("gemini cache unavailable on api (400)");
    t = 10 * 60_000;
    expect(await cache.get("api", "m", "rules", TOOLS)).toBe("cachedContents/c1");
  });

  it("drop forgets a cache the backend no longer has, so the next request makes a new one", async () => {
    const cache = cacheOn();
    await cache.get("api", "m", "rules", TOOLS);
    cache.drop("cachedContents/c1");
    expect(await cache.get("api", "m", "rules", TOOLS)).toBe("cachedContents/c2");
  });
});
