# Step 5: qa

## Read first
- `CLAUDE.md` and `docs/*.md` are already in your prompt; do not re-read them.
- What this phase changed: `git diff --stat main...HEAD`, then the changed files.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Run the QA pass in docs/UI_QA.md on the screens this phase changed: **`/learned/doughhouse` (host page and KIBO widget), D1 kiosk picker, D2 with Doughhouse, D3 learned end card, the phone's learned states (pending, mismatch, learned confirm card)**.
Save screenshots in phases/6-learn/qa/ (`npm run qa:ui` on branch `feat-6-learn` writes there). Fix H failures on KIBO's own screens (the learned kiosk page itself is a third-party stand-in and is not changed; note its issues as context only).
Walk Sequence 3 in ARCHITECTURE and the "Learned kiosk replay fails" exception row on the real screens, and journey J3 with the Doughhouse choice.
Security spot checks: a pending command whose item id is not in the skill never reaches a click; a forbidden label is never clicked (unit test); `bridgeReport` from the phone token → 403; no kiosk page text is stored in the session.
Check R-001 for every number added to KIBO_LEARN, TESTING, README or the landing page in this phase.
Log everything else in docs/ISSUE.md following its "How to use".
If an H failure is out of scope or needs a decision: log it and set this step "blocked" with the issue id.
Write phases/6-learn/qa/REPORT.md: one line per angle A–I with pass/fail and issue ids.

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
