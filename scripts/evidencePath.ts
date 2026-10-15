import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// Where a test or script writes a measurement. The files in evidence/ are cited by docs/plan/NUMBERS.md, so they
// change only on purpose: with EVIDENCE=1 (then update NUMBERS.md in the same commit, R-021). Any other run writes the
// same data to test-results/evidence/ (git-ignored), so `npm run test:e2e` never rewrites a cited number (I-099).

export function evidencePath(name: string, env: Record<string, string | undefined> = process.env, root = process.cwd()): string {
  const path = env.EVIDENCE === "1" ? join(root, "evidence", name) : join(root, "test-results", "evidence", name);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}
