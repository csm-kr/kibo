import { afterEach, describe, expect, it, vi } from "vitest";

// index.ts caches the store, so each case loads a fresh copy of the module.
async function load() {
  vi.resetModules();
  return import("./index");
}

afterEach(() => vi.unstubAllEnvs());

describe("getStore", () => {
  it("refuses STORE=memory in production: sessions would split across Cloud Run instances", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STORE", "memory");
    vi.stubEnv("ALLOW_MEMORY_STORE", "");
    const { getStore } = await load();
    expect(() => getStore()).toThrow(/ALLOW_MEMORY_STORE/);
  });

  it("allows it in production with ALLOW_MEMORY_STORE=1", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STORE", "memory");
    vi.stubEnv("ALLOW_MEMORY_STORE", "1");
    const { getStore } = await load();
    expect(getStore().constructor.name).toBe("MemoryStore");
  });

  it("uses memory outside production without the override", async () => {
    vi.stubEnv("STORE", "memory");
    const { getStore } = await load();
    expect(getStore().constructor.name).toBe("MemoryStore");
  });
});
