# Step 1: audit-fixes

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt (SECURITY, ARCHITECTURE, RULE matter most).
- `phases/11-hardening/AUDIT.md` (step 0) and the `it.skip` tests it added.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
First, one reliability fix found by the orchestrating session on 10-13: a Cloud Build failure (the build context excluded `evidence/`, which `src/lib/demo/evidence.ts` and a test import) made `scripts/deploy.sh` fail, but the old revision kept answering `/api/health`, so the run looked healthy at a glance. Make `scripts/deploy.sh` (a) run a local `npm run build` before uploading and stop on failure, (b) record the serving revision before the deploy and fail loudly unless `/api/health` reports a **new** `revision` afterwards, and (c) print one clear final line (`DEPLOYED <revision>` or `DEPLOY FAILED: <reason>`). Add a guard test that every file `src/` imports from outside `src/` (like `evidence/*.json`, `data/`, `skills/`) is not excluded by `.gcloudignore` or `.dockerignore` (parse the ignore files; a small script test is enough). Log it in `docs/ISSUE.md` (class `build-context`), fixed.

Then fix every P0 and P1 in AUDIT.md, then the P2s that are cheap. For each: turn its skipped test on (or write one), see it fail, fix, see it pass; mark the ISSUE row fixed with how. Keep docs in step with every contract you touch (R-002). Findings that need a product decision: leave open with a note and, if P0, set this step blocked with the issue id.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
```

## Verify
1. Run the AC commands; no `it.skip` from AUDIT.md remains for a fixed item.
2. List fixed and remaining items in the summary.
3. Update this step in `phases/11-hardening/index.json` (completed + summary / error / blocked).

## Do not
- Do not loosen a safety rule to make a test pass.
- Break existing tests.
