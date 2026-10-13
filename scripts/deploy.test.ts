import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// scripts/deploy.sh with fake npm, gcloud, curl and sleep on PATH: nothing reaches Google Cloud. On 10-13 a failed
// Cloud Build left the old revision serving and the run looked healthy; the script must say DEPLOY FAILED then.

interface Run {
  build?: number;
  deploy?: number;
  /** Revision /api/health reports after the deploy; absent keeps the old one. */
  newRevision?: string;
}

function run(opts: Run) {
  const dir = mkdtempSync(join(tmpdir(), "kibo-deploy-"));
  mkdirSync(join(dir, "scripts"));
  copyFileSync(join(process.cwd(), "scripts/deploy.sh"), join(dir, "scripts/deploy.sh"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const log = join(dir, "calls.log");
  const state = join(dir, "revision");
  writeFileSync(state, "kibo-00041-old");
  const fake = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $*" >> "${log}"\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  fake("npm", `exit ${opts.build ?? 0}`);
  fake(
    "gcloud",
    `case "$*" in
  *describe*) echo "https://kibo.example" ;;
  *deploy*) [ ${opts.deploy ?? 0} -eq 0 ] || exit 1; ${opts.newRevision ? `echo "${opts.newRevision}" > "${state}"` : ":"} ;;
esac`,
  );
  fake("curl", `printf '{"ok":true,"revision":"%s"}' "$(cat "${state}")"`);
  fake("sleep", "exit 0");
  const out = spawnSync("sh", [join(dir, "scripts/deploy.sh")], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  const lines = out.stdout.trim().split("\n");
  return { code: out.status, last: lines.at(-1), calls: existsSync(log) ? readFileSync(log, "utf8") : "" };
}

// Each run spawns sh, node and the fakes; the old-revision case polls /api/health 12 times, about 5 s on a busy machine.
describe("scripts/deploy.sh", { timeout: 30_000 }, () => {
  it("prints DEPLOYED with the new revision when /api/health reports it", () => {
    const r = run({ newRevision: "kibo-00042-new" });
    expect(r.last).toBe("DEPLOYED kibo-00042-new");
    expect(r.code).toBe(0);
    // The local build runs before anything is uploaded, and the deploy names the region.
    expect(r.calls.indexOf("npm run build")).toBeLessThan(r.calls.indexOf("gcloud run deploy"));
    expect(r.calls).toContain("--region asia-northeast3");
  });

  it("stops before uploading when the local build fails", () => {
    const r = run({ build: 1, newRevision: "kibo-00042-new" });
    expect(r.last).toBe("DEPLOY FAILED: local npm run build failed");
    expect(r.code).toBe(1);
    expect(r.calls).not.toContain("gcloud run deploy");
  });

  it("fails loudly when Cloud Build fails and the old revision keeps serving", () => {
    const r = run({ deploy: 1 });
    expect(r.last).toBe("DEPLOY FAILED: gcloud run deploy failed (the old revision kibo-00041-old is still serving)");
    expect(r.code).toBe(1);
  });

  it("fails when the deploy returns but /api/health still reports the old revision", () => {
    const r = run({});
    expect(r.last).toBe("DEPLOY FAILED: /api/health still reports the old revision kibo-00041-old");
    expect(r.code).toBe(1);
  });
});
