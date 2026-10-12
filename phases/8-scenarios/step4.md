# Step 4: qa

## Read first
- `CLAUDE.md` and `docs/*.md` are already in your prompt; do not re-read them.
- What this phase changed: `git diff --stat main...HEAD`, then the changed files.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Run the QA pass in docs/UI_QA.md on the screens this phase changed: **D2 with the scenario guide (closed, open, mid-scenario, finished), "Play it for me" states, the "What the AI did" strip (open, collapsed)** for each environment.
Save screenshots in phases/8-scenarios/qa/ (`npm run qa:ui` on branch `feat-8-scenarios` writes there). Fix H failures on these screens.
Angle H: a cold judge at 1440×900 with no microphone: can they run a scenario and understand that the AI cannot pay, within 2 minutes?
Run `npm run test:e2e:live` once (real Gemini) and record which scenarios played through; log failures with the scenario id.
Angle G: the strip and the guide show only menu-data names and fixed copy.
Log everything else in docs/ISSUE.md following its "How to use".
If an H failure is out of scope or needs a decision: log it and set this step "blocked" with the issue id.
Write phases/8-scenarios/qa/REPORT.md: one line per angle A–I with pass/fail and issue ids.

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
