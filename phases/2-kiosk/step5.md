# Step 5: qa

## Read first
- `CLAUDE.md` and `docs/*.md` are already in your prompt; do not re-read them.
- What this phase changed: `git diff --stat main...HEAD`, then the changed files.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Run the QA pass in docs/UI_QA.md on the screens this phase changed: **K1, K2, K3, K4, K5, K6, K7, K8, KX** (kiosk at 1080×1920).
Save screenshots in phases/2-kiosk/qa/ (`npm run qa:ui` on branch `feat-2-kiosk` writes there). Fix H failures on these screens.
Walk Flow B and the kiosk side of Flow A and every kiosk row of UX "Exception flows" on the real screens (E2E tests and the QA screenshots), and the kiosk parts of journeys J1 and J2 in `docs/USER_JOURNEY.md`.
Look at every screenshot yourself for the visual heuristics V1–V12 and the anti-patterns in UI_GUIDE; compare with the prototype `design/prototype/Main.dc.html` for intent (not pixel values).
Log everything else in docs/ISSUE.md following its "How to use".
If an H failure is out of scope or needs a decision: log it and set this step "blocked" with the issue id.
Write phases/2-kiosk/qa/REPORT.md: one line per angle A–I with pass/fail and issue ids.

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
