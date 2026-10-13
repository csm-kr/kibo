# Step 6: qa

## Read first
- `CLAUDE.md` and `docs/*.md` are already in your prompt; do not re-read them.
- What this phase changed: `git diff --stat main...HEAD`, then the changed files.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Run the QA pass in docs/UI_QA.md on the screens this phase changed: **every phone screen after the redesign (P-start to P7, PX, learned and ticket states, in `/assistant` and in `/demo`), the `/design/phone` preview, `/app` home, `/app/scan` (hint, scanning, denied, foreign QR), `/kiosk` landscape with the pairing panel (waiting, connected), `/demo` "use my phone" mode, and `/assistant` after a scan (mic hint, talk)**.
Save screenshots in phases/12-phone-app/qa/ (`npm run qa:ui` on branch `feat-12-phone-app` writes there). Fix H failures on these screens.
Have a fresh-eyes agent compare the phone screenshots with `phases/9-polish/qa/` (before) against UI_GUIDE "Phone design": cleaner and calmer, every rule kept; list regressions.
Walk journeys J1 and J2 as a two-device flow (phone app → scan → talk → confirm → pay on the kiosk) and J3 with the "use my phone" option.
Security spot checks: a QR of another origin is refused; the service worker never serves `/api/*`; the pairing panel never shows the token as text; camera stops after a scan.
Log everything else in docs/ISSUE.md following its "How to use".
If an H failure is out of scope or needs a decision: log it and set this step "blocked" with the issue id.
Write phases/12-phone-app/qa/REPORT.md: one line per angle A–I with pass/fail and issue ids.

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
