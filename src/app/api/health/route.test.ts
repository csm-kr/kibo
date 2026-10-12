import { describe, expect, it, vi } from "vitest";
import pkg from "../../../../package.json";
import { BASE, read } from "../testing";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("reports ok, version, store and revision", async () => {
    const { status, body } = await read(await GET(new Request(`${BASE}/api/health`)));
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, version: pkg.version, store: "memory", revision: expect.any(String) });
  });

  it("?deep=1 without GEMINI_API_KEY: 503, the store passes, both model checks fail, no network", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("GEMINI_API_KEY", "");
    try {
      const { status, body } = await read(await GET(new Request(`${BASE}/api/health?deep=1`)));
      expect(status).toBe(503);
      expect(body).toEqual({ ok: false, checks: { store: "ok", textModel: "fail", liveModel: "fail" } });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
