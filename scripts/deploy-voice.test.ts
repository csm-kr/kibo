import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// scripts/deploy-voice.sh with fake npm, gcloud, curl and sleep on PATH, like deploy.test.ts: nothing reaches Google Cloud.

interface Run {
  build?: number;
  cloudBuild?: number;
  deploy?: number;
  /** Revision /healthz reports after the deploy; absent keeps the old one. */
  newRevision?: string;
}

function run(opts: Run) {
  const dir = mkdtempSync(join(tmpdir(), "kibo-deploy-voice-"));
  mkdirSync(join(dir, "scripts"));
  copyFileSync(join(process.cwd(), "scripts/deploy-voice.sh"), join(dir, "scripts/deploy-voice.sh"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const log = join(dir, "calls.log");
  const state = join(dir, "revision");
  writeFileSync(state, "kibo-voice-00001-old");
  const fake = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $*" >> "${log}"\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  fake("npm", `exit ${opts.build ?? 0}`);
  fake(
    "gcloud",
    `case "$*" in
  *"builds submit"*) exit ${opts.cloudBuild ?? 0} ;;
  *describe*) echo "https://kibo-voice.example" ;;
  *deploy*) [ ${opts.deploy ?? 0} -eq 0 ] || exit 1; ${opts.newRevision ? `echo "${opts.newRevision}" > "${state}"` : ":"} ;;
esac`,
  );
  fake("curl", `printf '{"ok":true,"revision":"%s"}' "$(cat "${state}")"`);
  fake("sleep", "exit 0");
  const out = spawnSync("sh", [join(dir, "scripts/deploy-voice.sh")], { encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  const lines = out.stdout.trim().split("\n");
  return { code: out.status, last: lines.at(-1), calls: existsSync(log) ? readFileSync(log, "utf8") : "" };
}

describe("scripts/deploy-voice.sh", { timeout: 30_000 }, () => {
  it("builds Dockerfile.voice, deploys kibo-voice and prints DEPLOYED with the new revision", () => {
    const r = run({ newRevision: "kibo-voice-00002-new" });
    expect(r.last).toBe("DEPLOYED kibo-voice-00002-new");
    expect(r.code).toBe(0);
    expect(r.calls.indexOf("npm run voice:build")).toBeLessThan(r.calls.indexOf("gcloud builds submit"));
    expect(r.calls).toContain("--config voice-relay/cloudbuild.yaml");
    const deploy = r.calls.split("\n").find((l) => l.startsWith("gcloud run deploy")) ?? "";
    expect(deploy).toContain("gcloud run deploy kibo-voice");
    expect(deploy).toContain("--region asia-northeast3");
    expect(deploy).toContain("--service-account kibo-runtime@kibo-2026.iam.gserviceaccount.com");
    expect(deploy).toContain("--timeout 900");
    expect(deploy).toContain("--min-instances 0");
    expect(deploy).toContain("--max-instances 2");
    expect(deploy).toContain("--session-affinity");
    // Vertex AI Live, post-paid; no API key secret on this service.
    expect(deploy).toContain("VOICE_VERTEX_LOCATION=us-central1");
    expect(deploy).not.toContain("GEMINI_API_KEY");
  });

  it("stops before uploading when the local bundle fails", () => {
    const r = run({ build: 1, newRevision: "kibo-voice-00002-new" });
    expect(r.last).toBe("DEPLOY FAILED: local npm run voice:build failed");
    expect(r.code).toBe(1);
    expect(r.calls).not.toContain("gcloud builds submit");
  });

  it("fails loudly when Cloud Build fails", () => {
    const r = run({ cloudBuild: 1 });
    expect(r.last).toBe("DEPLOY FAILED: Cloud Build failed (the old revision kibo-voice-00001-old is still serving)");
    expect(r.code).toBe(1);
    expect(r.calls).not.toContain("gcloud run deploy");
  });

  it("fails when the deploy returns but /healthz still reports the old revision", () => {
    const r = run({});
    expect(r.last).toBe("DEPLOY FAILED: /healthz still reports the old revision kibo-voice-00001-old");
    expect(r.code).toBe(1);
  });
});
