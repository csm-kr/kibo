import { describe, expect, it } from "vitest";
import { isEnvPath, scanPatch, scanText } from "./scan-repo";

// Fake secrets are built at runtime, so this file never holds a string the scanner (or another scanner) would flag.
const rep = (c: string, n: number) => c.repeat(n);
const fake = {
  google: "AI" + "za" + rep("Q", 35),
  openai: "s" + "k-" + "proj-" + rep("a1", 12),
  privateKey: rep("-", 5) + "BEGIN RSA " + "PRIVATE KEY" + rep("-", 5),
  serviceAccount: `{ "type": "service` + `_account", "project_id": "x" }`,
  azure: "subscriptionKey = " + rep("ab12", 8),
};

describe("scanText", () => {
  it("names each kind of secret and never returns the value", () => {
    expect(scanText(`GEMINI_API_KEY=${fake.google}`)).toEqual(["google-api-key"]);
    expect(scanText(`const k = "${fake.openai}";`)).toEqual(["openai-key"]);
    expect(scanText(fake.privateKey)).toEqual(["private-key-block"]);
    expect(scanText(fake.serviceAccount)).toEqual(["service-account-json"]);
    expect(scanText(fake.azure)).toEqual(["azure-style-key"]);
    expect(scanText(`${fake.google} ${fake.openai}`).join(" ")).not.toContain(fake.google);
  });

  it("leaves ordinary code and text alone", () => {
    expect(scanText("const task-list = risk-free; // ask-me")).toEqual([]);
    expect(scanText("commit " + rep("ab12", 10))).toEqual([]); // a 40-hex git hash
    expect(scanText("const key = " + rep("ab12", 10))).toEqual([]); // 40 hex is not a 32-hex key
    expect(scanText("hash " + rep("ab12", 8))).toEqual([]); // 32 hex without key or subscription nearby
    expect(scanText("GEMINI_API_KEY=<your key>")).toEqual([]);
  });
});

describe("isEnvPath", () => {
  it("flags .env files but not the example", () => {
    expect(isEnvPath(".env")).toBe(true);
    expect(isEnvPath("videos/app/.env.local")).toBe(true);
    expect(isEnvPath(".env.example")).toBe(false);
    expect(isEnvPath("src/lib/env.ts")).toBe(false);
    expect(isEnvPath("docs/.environment.md")).toBe(false);
  });
});

describe("scanPatch", () => {
  it("reports commit, path and pattern for added lines only", () => {
    const patch = [
      "commit 1111111111111111111111111111111111111111",
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      `+const k = "${fake.google}";`,
      `-const old = "${fake.openai}";`,
      "commit 2222222222222222222222222222222222222222",
      "diff --git a/.env b/.env",
      "new file mode 100644",
      "+++ b/.env",
      "+X=1",
    ];
    const found = scanPatch(patch);
    expect(found).toEqual([
      { where: "1111111", path: "src/a.ts", pattern: "google-api-key" },
      { where: "2222222", path: ".env", pattern: "env-file" },
    ]);
    expect(JSON.stringify(found)).not.toContain(fake.google);
  });
});
