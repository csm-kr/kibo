import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the Cloud Build context: `gcloud run deploy --source` uploads what .gcloudignore lets through, and the
// Dockerfile copies what .dockerignore lets through, then runs `next build`, which also type-checks the tests. On
// 10-13 `evidence/` was ignored while src/ imported it, so the build failed and the old revision kept serving.

const ROOT = process.cwd();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

/** Repo-relative paths src/ reads at build time from outside src/: relative imports and root-relative globs. */
function outsideImports(): string[] {
  const found = new Set<string>();
  for (const file of sourceFiles(join(ROOT, "src"))) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/(?:from\s+|import\()\s*["'](\.{1,2}\/[^"']+)["']/g)) {
      const path = relative(ROOT, resolve(dirname(file), m[1]));
      if (!path.startsWith("src/")) found.add(path);
    }
    for (const m of text.matchAll(/import\.meta\.glob\(\s*["']\/([^"']+)["']/g)) found.add(m[1]);
  }
  return [...found].sort();
}

/** The gitignore subset these files use: comments, `*`, `?`, anchored and unanchored patterns, `!` negation. */
function ignoredBy(rulesText: string, path: string): boolean {
  const rules = rulesText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const segments = path.split("/");
  let ignored = false;
  for (const rule of rules) {
    const negate = rule.startsWith("!");
    const pattern = (negate ? rule.slice(1) : rule).replace(/\/$/, "");
    const anchored = pattern.replace(/^\//, "").includes("/") || pattern.startsWith("/");
    const glob = pattern.replace(/^\//, "");
    const re = new RegExp(
      `^${glob
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "\u0000")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]")
        .replace(/\u0000/g, ".*")}$`,
    );
    // A pattern matches a path or any directory above it.
    const prefixes = segments.map((_, i) => segments.slice(0, i + 1).join("/"));
    const hit = anchored ? prefixes.some((p) => re.test(p)) : segments.some((s) => re.test(s));
    if (hit) ignored = !negate;
  }
  return ignored;
}

describe("build context", () => {
  const imports = outsideImports();

  it("finds the files src/ reads from outside src/", () => {
    // If this list changes, the checks below still cover it; this only proves the scan works.
    expect(imports).toEqual(
      expect.arrayContaining([
        "data/kiosks/malo.json",
        "evidence/touch-hero-efficient.json",
        "evidence/human-runs.template.json",
        "package.json",
        "skills/doughhouse.json",
      ]),
    );
  });

  it("would have caught the 10-13 failure: an `evidence` rule drops what src/ imports", () => {
    expect(imports.filter((p) => ignoredBy("node_modules\nevidence\n", p))).toEqual(
      expect.arrayContaining(["evidence/touch-hero-efficient.json"]),
    );
  });

  for (const file of [".gcloudignore", ".dockerignore"]) {
    const rules = readFileSync(join(ROOT, file), "utf8");

    it(`${file} keeps every file src/ imports from outside src/`, () => {
      expect(imports.filter((p) => ignoredBy(rules, p))).toEqual([]);
    });

    it(`${file} still drops secrets and bulk folders`, () => {
      for (const p of [".env", ".env.local", "node_modules/x/index.js", "videos/a.mp4", "spikes/x.json", "docs/PRD.md"]) {
        expect(ignoredBy(rules, p), p).toBe(true);
      }
    });
  }
});

// Cloud Run logged `EACCES: permission denied, mkdir '/app/.next/cache'` and an unhandledRejection on every image
// optimisation since at least kibo-00021 (10-17): the run stage copied the standalone build as root, then ran as node.
describe("Dockerfile run stage", () => {
  const text = readFileSync(join(ROOT, "Dockerfile"), "utf8");
  const run = text.slice(text.indexOf("AS run"));

  it("gives the node user a writable .next/cache before it switches to node", () => {
    const user = run.indexOf("USER node");
    const cache = run.search(/RUN mkdir -p \.next\/cache && chown -R node:node \.next/);
    expect(user).toBeGreaterThan(0);
    expect(cache).toBeGreaterThan(run.indexOf("COPY --from=build"));
    expect(cache).toBeLessThan(user);
  });
});
