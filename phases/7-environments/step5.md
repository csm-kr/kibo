# Step 5: qa

## Read first
- `CLAUDE.md` and `docs/*.md` are already in your prompt; do not re-read them.
- What this phase changed: `git diff --stat main...HEAD`, then the changed files.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Run the QA pass in docs/UI_QA.md on the screens this phase changed: **airport_rail K1, K3, K4, K6, K7, K8; MALO in English mode (K1–K8); D1 environment picker; D2 and D3 for airport_rail; the landing section**.
Save screenshots in phases/7-environments/qa/ (`npm run qa:ui` on branch `feat-7-environments` writes there). Fix H failures on these screens.
Walk journey J2 (Mei) on the airport kiosk with the phone in English, and J3 with each environment card.
Angle G with extra care: no real airport, railway, station, card or operator names; no emoji icons; English copy natural; fares only from data.
Check that MALO's Korean flow and the hero order are unchanged (E2E and screenshots).
Log everything else in docs/ISSUE.md following its "How to use".
If an H failure is out of scope or needs a decision: log it and set this step "blocked" with the issue id.
Write phases/7-environments/qa/REPORT.md: one line per angle A–I with pass/fail and issue ids.

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
