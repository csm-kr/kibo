# Step 3: qa

## Read first
- `CLAUDE.md` and `docs/*.md` are already in your prompt; do not re-read them.
- What this phase changed: `git diff --stat main...HEAD`, then the changed files.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Run the QA pass in docs/UI_QA.md on the screens this phase changed: **the landing page `/`** (and any screen touched while fixing).
Save screenshots in phases/5-ship/qa/ (`npm run qa:ui` on branch `feat-5-ship` writes there). Fix H failures on these screens.
Angle H for `/`: a cold judge must know in 20 seconds what KIBO is and where to click.
Angle G and rule R-001 across `README.md`, `/` and `spikes/README.md`: every number has its evidence file; no brands; no OpenAI claims for the product; no legal-compliance claims.
Review `scripts/deploy.sh`, `.gcloudignore`, `.dockerignore` and the deep health route against SECURITY and OPERATIONS (region flag, secrets from Secret Manager, no `.env` in the build context, min/max instances).
Log everything else in docs/ISSUE.md following its "How to use".
If an H failure is out of scope or needs a decision: log it and set this step "blocked" with the issue id.
Write phases/5-ship/qa/REPORT.md: one line per angle A–I with pass/fail and issue ids, plus a "Deploy review" section.

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
