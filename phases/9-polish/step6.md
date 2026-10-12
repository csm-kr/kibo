# Step 6: qa

## Read first
- `CLAUDE.md` and `docs/*.md` are already in your prompt; do not re-read them.
- What this phase changed: `git diff --stat main...HEAD`, then the changed files; `phases/9-polish/REVIEW.md`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Run the QA pass in docs/UI_QA.md on every screen this phase changed (see the fixed items in REVIEW.md), plus D3 with the comparison card and `/mic-test`.
Save screenshots in phases/9-polish/qa/ (`npm run qa:ui` on branch `feat-9-polish` writes there). Fix H failures on these screens.
Re-check each REVIEW.md item marked fixed against its new screenshot; reopen any that is not.
Angle G and R-001 for the comparison card and the cost evidence.
Log everything else in docs/ISSUE.md following its "How to use".
If an H failure is out of scope or needs a decision: log it and set this step "blocked" with the issue id.
Write phases/9-polish/qa/REPORT.md: one line per angle A–I with pass/fail and issue ids, and the list of REVIEW.md items verified.

## Acceptance criteria
```bash
npm run lint && npm run build && npm run test
npm run test:e2e
python3 design/prototype/e2e_check.py
npm run qa:ui
```

## Do not
- Change features or scope while fixing; only fix what breaks a written rule.
- Mark the step completed while an H rule fails on a changed screen.
