import { spawn, spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { createInterface } from "node:readline";

// Secret and size scan before the repo goes public (`npm run scan:repo`): every line added in any commit of any
// branch (`git log -p --all`), every blob in history, and every file git would publish from the working tree
// (tracked, plus untracked files that are not ignored). Prints commit, path and pattern name only, never the matched
// value. Exits 1 on any finding. A real secret in history needs a person: rotate it, then decide on a history rewrite.

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "google-api-key", re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: "openai-key", re: /(?<![A-Za-z0-9])sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/ },
  { name: "private-key-block", re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/ },
  { name: "service-account-json", re: /"type"\s*:\s*"service_account"/ },
  // Azure-style keys are 32 hex characters; alone that is any md5, so only next to "key" or "subscription".
  { name: "azure-style-key", re: /(?:key|subscription)[^\n]{0,40}?(?<![0-9a-fA-F])[0-9a-fA-F]{32}(?![0-9a-fA-F])/i },
];

const MAX_BYTES = 10 * 1024 * 1024;

export interface Finding {
  /** Short commit hash, or "worktree". */
  where: string;
  path: string;
  pattern: string;
}

/** Names of the patterns the text matches; never the matched text. */
export function scanText(text: string): string[] {
  return PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
}

/** `.env`, `.env.local`, … anywhere; `.env.example` holds names only and is meant to be public. */
export function isEnvPath(path: string): boolean {
  const base = path.split("/").pop() ?? "";
  return /^\.env(\..+)?$/.test(base) && base !== ".env.example";
}

/** Findings in `git log -p` output: added lines only (a removed line was added by an earlier commit). */
export function scanPatch(lines: Iterable<string>): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  let commit = "";
  let path = "";
  const add = (pattern: string) => {
    const key = `${commit} ${path} ${pattern}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ where: commit.slice(0, 7), path, pattern });
  };
  for (const line of lines) {
    if (line.startsWith("commit ")) commit = line.slice(7, 47);
    else if (line.startsWith("diff --git ")) {
      path = line.replace(/^diff --git a\/.* b\//, "");
      if (isEnvPath(path)) add("env-file");
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      for (const name of scanText(line)) add(name);
    }
  }
  return out;
}

function git(args: string[]): string {
  const r = spawnSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr.trim()}`);
  return r.stdout;
}

async function scanHistory(): Promise<Finding[]> {
  const child = spawn("git", ["log", "-p", "--all", "--no-color", "--no-ext-diff", "--format=commit %H"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const lines: string[] = [];
  const found: Finding[] = [];
  // Scan one commit at a time, so memory stays bounded on a long history.
  for await (const line of rl) {
    if (line.startsWith("commit ") && lines.length) found.push(...scanPatch(lines.splice(0)));
    lines.push(line);
  }
  found.push(...scanPatch(lines));
  return found;
}

/** Blobs over 10 MB anywhere in history, with the first path git names for them. */
function bigBlobs(): Finding[] {
  const objects = git(["rev-list", "--objects", "--all"]);
  const r = spawnSync("git", ["cat-file", "--batch-check=%(objecttype) %(objectsize) %(rest)"], {
    input: objects,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const out: Finding[] = [];
  for (const line of r.stdout.split("\n")) {
    const m = /^blob (\d+) (.+)$/.exec(line);
    if (m && Number(m[1]) > MAX_BYTES) out.push({ where: "history", path: m[2], pattern: "file-over-10MB" });
  }
  return out;
}

function scanWorktree(): Finding[] {
  const files = git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).split("\0").filter(Boolean);
  const out: Finding[] = [];
  for (const path of [...new Set(files)]) {
    let size: number;
    try {
      const st = statSync(path);
      if (!st.isFile()) continue; // a gitlink or a deleted file
      size = st.size;
    } catch {
      continue;
    }
    if (isEnvPath(path)) out.push({ where: "worktree", path, pattern: "env-file" });
    if (size > MAX_BYTES) {
      out.push({ where: "worktree", path, pattern: "file-over-10MB" });
      continue;
    }
    const buf = readFileSync(path);
    if (buf.includes(0)) continue; // binary
    for (const pattern of scanText(buf.toString("utf8"))) out.push({ where: "worktree", path, pattern });
  }
  return out;
}

async function main() {
  const history = await scanHistory();
  const findings = [...history, ...bigBlobs(), ...scanWorktree()];
  const commits = git(["rev-list", "--all", "--count"]).trim();
  for (const f of findings) console.log(`${f.where}  ${f.path}  ${f.pattern}`);
  console.log(`scan:repo: ${commits} commits and the working tree, ${findings.length} finding(s)`);
  if (findings.length) process.exit(1);
}

if (process.argv[1]?.endsWith("scan-repo.ts")) main();
