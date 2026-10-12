# Step 4: qa

## Read first
- `CLAUDE.md` and `docs/*.md` are already in your prompt; do not re-read them.
- What this phase changed: `git diff --stat main...HEAD`, then the changed files.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Run the QA pass in docs/UI_QA.md on the screens this phase changed: **P1, P3 (mic states), PX (reconnecting, fallback), D2 (voice and fallback)**.
Save screenshots in phases/4-voice/qa/ (`npm run qa:ui` on branch `feat-4-voice` writes there). Fix H failures on these screens.
Walk Flow A by voice (use `evidence/voice-e2e.json` and the live test), Flow C3 (no mic → text), the "Noise" and "Phone screen off / disconnected" exception rows, and journeys J1 and J3.
Security spot checks: `/api/live-token` with the kiosk token, after `paying`, beyond the per-session limit; the token response has no API key; the browser bundle contains no API key (search `.next/static` for the key's first 8 characters read from `.env` with a `node` script that prints only true/false).
Log everything else in docs/ISSUE.md following its "How to use".
If an H failure is out of scope or needs a decision: log it and set this step "blocked" with the issue id.
Write phases/4-voice/qa/REPORT.md: one line per angle A–I with pass/fail and issue ids.

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
