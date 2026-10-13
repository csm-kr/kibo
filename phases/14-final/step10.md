# Step 10: qa

## Read first
- `CLAUDE.md` and `docs/*.md` are already in your prompt; do not re-read them.
- What this phase changed: `git diff --stat main...HEAD`, then the changed files; `docs/plan/judges/JUDGE_QA.md`, `docs/plan/NUMBERS.md`, `phases/14-final/REPO.md`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Run the QA pass in docs/UI_QA.md on every screen this phase changed, plus the judge walks J3 and J1 and the two-device flow through the E2E suite, and `npm run test:e2e:live` once.
Have a fresh-eyes agent re-walk the JUDGE_QA rows owned by P14 (D1–D7, B4–B6, A5, A7, C4, C7, C9, E1, E2) and mark each fixed / partly / not, with screenshot paths.
Save screenshots in phases/14-final/qa/. Fix H failures on changed screens. Log everything else in docs/ISSUE.md.
Write phases/14-final/qa/REPORT.md: one line per angle A–I, the JUDGE_QA rows verified, and a "ready to submit" list of what a person still has to do (publish the repo, real-phone and real-user checks, video, deck on the official template, form).

## Acceptance criteria
```bash
npm run lint && npm run build && npm run test
npm run test:e2e
python3 design/prototype/e2e_check.py
npm run qa:ui
npm run scan:repo
```

## Do not
- Change features or scope while fixing; only fix what breaks a written rule.
- Mark the step completed while an H rule fails on a changed screen.
