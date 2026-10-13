# Step 1: audit-fixes

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt (SECURITY, ARCHITECTURE, RULE matter most).
- `phases/11-hardening/AUDIT.md` (step 0) and the `it.skip` tests it added.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Fix every P0 and P1 in AUDIT.md, then the P2s that are cheap. For each: turn its skipped test on (or write one), see it fail, fix, see it pass; mark the ISSUE row fixed with how. Keep docs in step with every contract you touch (R-002). Findings that need a product decision: leave open with a note and, if P0, set this step blocked with the issue id.

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
