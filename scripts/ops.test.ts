import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// scripts/ci-check.sh, scripts/ops-setup.sh and cloudbuild.yaml (15-judge-fixes:5), with fake npm and gcloud on PATH:
// nothing reaches Google Cloud.

function fakes(bodies: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "kibo-ops-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const log = join(dir, "calls.log");
  for (const [name, body] of Object.entries(bodies)) {
    writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $*" >> "${log}"\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  delete env.ALERT_EMAILS;
  const calls = () => (existsSync(log) ? readFileSync(log, "utf8") : "");
  return { env, calls };
}

function sh(script: string, args: string[], env: NodeJS.ProcessEnv) {
  const out = spawnSync("sh", [join(process.cwd(), script), ...args], { encoding: "utf8", env });
  return { code: out.status, stdout: out.stdout, last: out.stdout.trim().split("\n").at(-1) };
}

describe("scripts/ci-check.sh", { timeout: 30_000 }, () => {
  it("runs lint, unit tests, the build and the forged-command check in that order", () => {
    const f = fakes({ npm: "exit 0" });
    const r = sh("scripts/ci-check.sh", [], f.env);
    expect(r.last).toBe("CI PASSED");
    expect(r.code).toBe(0);
    expect(f.calls().trim().split("\n")).toEqual([
      "npm run lint",
      "npm run test",
      "npm run build",
      "npm run check:attacks",
    ]);
  });

  it("stops at the first failing check", () => {
    const f = fakes({ npm: `case "$*" in *test*) exit 1 ;; esac` });
    const r = sh("scripts/ci-check.sh", [], f.env);
    expect(r.code).toBe(1);
    expect(r.last).toBe("CI FAILED: npm run test");
    expect(f.calls()).not.toContain("npm run build");
  });
});

describe("scripts/ops-setup.sh", { timeout: 30_000 }, () => {
  it("by default only prints: gcloud is never called", () => {
    const f = fakes({ gcloud: "exit 0" });
    const r = sh("scripts/ops-setup.sh", [], f.env);
    expect(r.code).toBe(0);
    expect(r.last).toBe("OPS SETUP PRINTED");
    expect(f.calls()).toBe("");
    for (const group of ["sessions", "sessionSecrets", "pairCodes"])
      expect(r.stdout).toContain(`--collection-group=${group} --enable-ttl`);
    expect(r.stdout).toContain("--path /api/health?deep=1");
    expect(r.stdout).toContain("uptime_check/check_passed");
  });

  it("with --apply creates what is missing", () => {
    const f = fakes({
      gcloud: `case "$*" in
  *"run services describe"*) echo "https://kibo.example" ;;
  *"uptime list-configs"*) if [ -f "$0.made" ]; then echo "projects/p/uptimeCheckConfigs/kibo-deep-health-abc"; fi ;;
  *"uptime create"*) touch "$0.made" ;;
  *"channels list"*) if [ -f "$0.channel" ]; then echo "projects/p/notificationChannels/7"; fi ;;
  *"channels create"*) touch "$0.channel" ;;
esac`,
    });
    const r = sh("scripts/ops-setup.sh", ["--apply"], { ...f.env, ALERT_EMAILS: "a@example.com" });
    expect(r.code).toBe(0);
    expect(r.last).toBe("OPS SETUP APPLIED");
    const calls = f.calls();
    expect(calls).toContain("ttls update expiresAt --collection-group=pairCodes --enable-ttl");
    expect(calls).toContain("host=kibo.example,project_id=kibo-2026");
    expect(calls).toContain("channels create");
    // Cloud Monitoring rejects an unquoted address in a filter (INVALID_ARGUMENT on the real run, 10-15).
    expect(calls).toContain('type="email" AND labels.email_address="a@example.com"');
    expect(calls).toContain("policies create");
    expect(r.stdout).toContain('metric.label.check_id=\\"kibo-deep-health-abc\\"');
    expect(r.stdout).toContain('"notificationChannels": ["projects/p/notificationChannels/7"]');
  });

  it("with --apply run again creates nothing that already exists", () => {
    const f = fakes({
      gcloud: `case "$*" in
  *"run services describe"*) echo "https://kibo.example" ;;
  *"uptime list-configs"*) echo "projects/p/uptimeCheckConfigs/kibo-deep-health-abc" ;;
  *"channels list"*) echo "projects/p/notificationChannels/1" ;;
  *"policies list"*) echo "projects/p/alertPolicies/2" ;;
esac`,
    });
    const r = sh("scripts/ops-setup.sh", ["--apply"], { ...f.env, ALERT_EMAILS: "a@example.com" });
    expect(r.code).toBe(0);
    const calls = f.calls();
    expect(calls).not.toContain("uptime create");
    expect(calls).not.toContain("channels create");
    expect(calls).not.toContain("policies create");
  });
});

describe("cloudbuild.yaml", () => {
  const y = readFileSync(join(process.cwd(), "cloudbuild.yaml"), "utf8");
  const at = (s: string) => {
    const i = y.indexOf(s);
    expect(i, s).toBeGreaterThanOrEqual(0);
    return i;
  };

  it("checks, then deploys a candidate with no traffic, checks its deep health, then moves traffic", () => {
    const order = [
      at("sh scripts/ci-check.sh"),
      at("- build"),
      at("--no-traffic"),
      at("--tag candidate"),
      at("$$URL/api/health?deep=1"),
      at("gcloud run services update-traffic"),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("deploys with the same region and flags as scripts/deploy.sh", () => {
    expect(y).toContain("_REGION: asia-northeast3");
    for (const flag of ["--min-instances 1", "--max-instances 3", "--concurrency 80", "--timeout 900", "--set-secrets GEMINI_API_KEY=gemini-api-key:latest"])
      expect(y).toContain(flag);
  });
});
