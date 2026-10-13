// Secret scan for the 11-hardening audit (step 0). Prints only true/false, counts and file paths, never a value.
// Usage: node phases/11-hardening/audit/secret-scan.mjs   (from the repo root)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 });

// Values from .env, read here and never printed. Only keys whose values look like secrets are checked.
const env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
const secrets = [];
for (const line of env.split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
  if (m && /KEY|SECRET|TOKEN|PASSWORD/.test(m[1]) && m[2].length >= 16) secrets.push({ name: m[1], value: m[2] });
}
console.log(`.env present: ${env.length > 0}; secret-like values: ${secrets.map((s) => s.name).join(", ") || "none"}`);

const tracked = git("ls-files").split("\n").filter(Boolean);
console.log(`.env tracked: ${tracked.some((f) => /(^|\/)\.env($|\.)/.test(f) && !f.endsWith(".example"))}`);

function grepAll(needle) {
  // Every commit's tree; -F fixed string, -l file names only. Exit code 1 means no match.
  const revs = git("rev-list", "--all").split("\n").filter(Boolean);
  const hits = new Set();
  for (let i = 0; i < revs.length; i += 200) {
    try {
      const out = git("grep", "-l", "-F", needle, ...revs.slice(i, i + 200));
      for (const l of out.split("\n").filter(Boolean)) hits.add(l.split(":").slice(1).join(":"));
    } catch (e) {
      if (e.status !== 1) throw e;
    }
  }
  return [...hits];
}

for (const s of secrets) {
  // The first 12 characters are enough to find a copy and never enough to use it.
  const files = grepAll(s.value.slice(0, 12));
  console.log(`${s.name} prefix in any commit: ${files.length > 0}${files.length ? ` (${files.join(", ")})` : ""}`);
  let working = false;
  for (const f of tracked) {
    try {
      if (readFileSync(f, "utf8").includes(s.value.slice(0, 12))) working = true;
    } catch {
      // Deleted or unreadable.
    }
  }
  console.log(`${s.name} prefix in the working tree's tracked files: ${working}`);
}

// Generic key shapes in tracked files; a hit lists the file and whether it equals a .env value.
const SHAPES = { googleApiKey: /AIza[0-9A-Za-z_-]{35}/g, openaiKey: /sk-[A-Za-z0-9_-]{32,}/g, privateKey: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g };
for (const f of tracked) {
  let text;
  try {
    text = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  for (const [kind, re] of Object.entries(SHAPES)) {
    for (const m of text.match(re) ?? []) {
      const real = secrets.some((s) => s.value === m);
      console.log(`shape ${kind} in ${f}: equals a .env value: ${real}`);
    }
  }
}
