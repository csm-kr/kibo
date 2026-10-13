# Step 5: qa

## Read first
- `CLAUDE.md` and `docs/*.md` are already in your prompt; do not re-read them.
- What this phase changed: `git diff --stat main...HEAD`, then the changed files; `phases/11-hardening/{AUDIT,LOAD}.md`, `evidence/{prompt-cache,load-check,lighthouse}.json`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Run the QA pass in docs/UI_QA.md on every screen this phase changed (Lighthouse fixes may touch many: list them from the diff), plus a full regression of the main journeys J1–J3 through the E2E suite and `npm run test:e2e:live` once.
Save screenshots in phases/11-hardening/qa/ (`npm run qa:ui` on branch `feat-11-hardening` writes there). Fix H failures on these screens.
Re-check each AUDIT.md item marked fixed with its test. Check R-001 for every number added in this phase.
Log everything else in docs/ISSUE.md following its "How to use".
If an H failure is out of scope or needs a decision: log it and set this step "blocked" with the issue id.
Write phases/11-hardening/qa/REPORT.md: one line per angle A–I with pass/fail and issue ids, and the audit items verified.

**Gemini API key credits (10-13):** the key's AI Studio prepaid credits ran out at about 14:07 KST (HTTP 402 "prepayment credits are depleted", I-104); the text agent runs on Vertex AI locally (`.env` `GEMINI_TEXT_BACKEND=vertex`), but Gemini Live needs the key. If `npm run test:e2e:live` fails **only** with HTTP 402 / credits depleted, record that in the summary and in I-104 and treat it as not a failure of this step (the orchestrator re-runs it after a top-up); do not retry it in a loop.

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
