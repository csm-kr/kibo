import { describe, expect, it } from "vitest";
import pkg from "../../../../package.json";
import { BASE, read } from "../testing";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("reports ok, version, store and revision", async () => {
    const { status, body } = await read(await GET(new Request(`${BASE}/api/health`)));
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, version: pkg.version, store: "memory", revision: expect.any(String) });
  });
});
