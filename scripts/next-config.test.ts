import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

// Next.js applies every matching `headers()` entry in order, and for the same key the last one wins
// (node_modules/next/dist/docs/.../headers.md). Only /app/scan may use the camera; e2e/app-scan.spec.ts checks the
// real responses.

async function headerFor(path: string, key: string): Promise<string | undefined> {
  const entries = (await nextConfig.headers?.()) ?? [];
  let value: string | undefined;
  for (const entry of entries) {
    const matches = entry.source === "/:path*" || entry.source === path;
    for (const h of matches ? entry.headers : []) if (h.key === key) value = h.value;
  }
  return value;
}

describe("Permissions-Policy", () => {
  it("allows the camera on /app/scan only; the microphone stays allowed everywhere", async () => {
    expect(await headerFor("/app/scan", "Permissions-Policy")).toBe("microphone=(self), camera=(self)");
    for (const path of ["/", "/app", "/assistant", "/kiosk", "/demo", "/mic-test"]) {
      expect(await headerFor(path, "Permissions-Policy")).toBe("microphone=(self), camera=()");
    }
  });
});
