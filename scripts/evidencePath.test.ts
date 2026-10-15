import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evidencePath } from "./evidencePath";

describe("evidencePath", () => {
  const root = mkdtempSync(join(tmpdir(), "kibo-evidence-"));

  it("writes to evidence/ only with EVIDENCE=1", () => {
    expect(evidencePath("bridge-replay.json", { EVIDENCE: "1" }, root)).toBe(join(root, "evidence", "bridge-replay.json"));
  });

  it("writes to the git-ignored test-results/evidence/ otherwise (I-099)", () => {
    for (const env of [{}, { EVIDENCE: "" }, { EVIDENCE: "0" }, { EVIDENCE: "true" }]) {
      expect(evidencePath("voice-e2e.json", env, root)).toBe(join(root, "test-results", "evidence", "voice-e2e.json"));
    }
  });

  it("creates the folder so the caller can write at once", () => {
    evidencePath("x.json", {}, root);
    expect(existsSync(join(root, "test-results", "evidence"))).toBe(true);
  });
});
