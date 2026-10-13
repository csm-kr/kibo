# Step 10: qa

## Read first
- `CLAUDE.md` and `docs/*.md` are already in your prompt; do not re-read them.
- What this phase changed: `git diff --stat main...HEAD`, then the changed files.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Run the QA pass in docs/UI_QA.md on the screens this phase changed: **every phone screen after the redesign (P-start to P7, PX, learned and ticket states, in `/assistant` and in `/demo`), the `/design/phone` preview, `/app` home, `/app/scan` (hint, scanning, denied, foreign QR), `/kiosk` landscape with the pairing panel (waiting, connected), `/demo` "use my phone" mode, and `/assistant` after a scan (mic hint, talk), and the "Paused · Tap to continue" layer from step 7 on the kiosk, phone and `/demo`, and one voice order in relay mode (steps 8–9) on the phone and `/demo`**.
Save screenshots in phases/12-phone-app/qa/ (`npm run qa:ui` on branch `feat-12-phone-app` writes there). Fix H failures on these screens.
Have a fresh-eyes agent compare the phone screenshots with `phases/9-polish/qa/` (before) against UI_GUIDE "Phone design": cleaner and calmer, every rule kept; list regressions.
Walk journeys J1 and J2 as a two-device flow (phone app → scan → talk → confirm → pay on the kiosk) and J3 with the "use my phone" option.
Security spot checks: a QR of another origin is refused; the service worker never serves `/api/*`; the pairing panel never shows the token as text; camera stops after a scan.
Log everything else in docs/ISSUE.md following its "How to use".
If an H failure is out of scope or needs a decision: log it and set this step "blocked" with the issue id.
Write phases/12-phone-app/qa/REPORT.md: one line per angle A–I with pass/fail and issue ids.

**Orchestrator findings from the step 0 preview (10-13, `phases/12-phone-app/qa/designphone-design-*-390x844.png`); check each on the real screens and fix if still present:**
- P6 order number: with `tabular-nums` in Space Grotesk at 7.5rem the digit "1" renders as the footed tabular glyph and reads like a "J" or a cut-off shape (`179` in `designphone-design-done-390x844.png`). Use proportional figures for this single large number and confirm with numbers that contain 1 and 7 (e.g. 117, 171).
- Dock: the right button's label is only "On"/"Off"; an older user cannot tell what is on. Label it "Voice on"/"Voice off" (Korean "음성 켜짐"/"음성 꺼짐") within the 56px target.
- Dock state labels: "Tap to stop" also shows while "Thinking…" and "Reconnecting…"; use a label that matches what a tap does in each state (or no action label while reconnecting).

**Orchestrator decision on I-172 (10-13), do this first in this step:** kiosk pages (`/kiosk`, `/learned/*`, and the kiosk half of `/demo` own-phone mode) **never show the idle pause while the page is visible**: a kiosk waits on K1 with its QR and code for a phone, and a learned kiosk's bridge must replay as soon as a phone orders. Keep the 60 s hidden-tab close and the server's 15 min stream cap for them. The phone (`/assistant`) and the `/demo` judge view keep the 20 min idle pause. Update the `StreamControl` options and tests (a kiosk option that disables the idle pause), `e2e/stream-idle.spec.ts`, UX KX, OPERATIONS "Open streams and cost" (visible kiosk tabs stay active by design; close kiosk tabs after a demo), and close I-172 with this decision.

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
