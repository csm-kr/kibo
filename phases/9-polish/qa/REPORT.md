# Phase 9 QA report (9-polish:6)

Scope: every screen the phase changed (REVIEW.md K1–K10, X1–X13): K1–K8 and KX on MALO, MALO in English and the airport rail ticket machine; P1–P7 and PX; D1–D3 for MALO, airport rail and the learned pizza kiosk, including D3 with the "Touch vs talk" card; `/` (landing); `/learned/doughhouse`; `/mic-test`.

## Commands (all run in this step)
- `npm run lint`, `npm run build`, `npm run test`: pass (738 unit tests, 1 skipped).
- `npm run test:e2e`: 19 passed, 14 `@live` skipped. `evidence/touch-hero.json` and `evidence/bridge-replay.json` were rewritten by the run and restored to the committed values (I-099).
- `python3 design/prototype/e2e_check.py`: 42 pass, 0 fail.
- `npm run qa:ui`: 26 passed, 260 states, **0 H**. Run twice; the second run after the two fixes below.

## Fixes in this step
- `e2e/qa/checks.ts` `focus`: restores every container's scroll position after tabbing. Before, later viewports and states inherited the scroll, so `demo-D3-done-1280x720.png` showed the bottom of the phone column with no numbers and `kiosk-KX-staff-1080x1920.png` had the ringed tile scrolled out of view (I-121 reopened and fixed; R-010 proposed).
- `src/components/kiosk/KioskToolbar.tsx`: the AI status pill added in 9-polish:1 used 40px side padding (off the 4/8 scale); now 48px. No other kiosk spacing changed (I-042 stays open).

## Angles
| Angle | Result | Notes and issues |
|---|---|---|
| A Numbers | pass | 0 H across 260 states (text, targets, gaps, contrast, reflow, 200% text, text spacing, focus). T misses all belong to known rows: kiosk 40px spacing I-042, `auto` margins I-075 (new places: K2's [처음으로] row, the landing place-card links and hero picture; the "real 30px padding" in REVIEW.md is an `mt-auto` margin), phone header brand line height I-140 (new, checker false positive), axe contrast "incomplete" I-043 (checked by eye: dark text on light fills, white on teal/navy; the landing architecture SVG reads cleanly) |
| B Visual heuristics | pass with P2s | V1: two filled blue buttons in P4's bottom area (I-142). D1 and landing captures uneven (I-123). D3 card pushes [Try again] below the phone column's fold (I-141) |
| C Flows | pass | Flow A, B ([처음으로] on K2/K3, small QR on K2), C1–C5 walked through the E2E and QA specs; learned end card still below the fold (I-073, open) |
| D Journeys | pass | J1 Pay: total and [Yes, pay now] fully in view at 320–430 wide. J2: ticket wording, adult fare, P5 names 카드 (Card). J3: guide open at 1440, no stuck counter, no [다른 휴대폰 연결] in `/demo` |
| E Nielsen 10 | pass | Heuristic 4: one price format on phone and kiosk. Heuristic 3: [처음으로] |
| F Accessibility | pass | axe 0 violations; focus visible and not obscured; language button icon-only below 400px keeps its accessible name (decided in I-084) |
| G Content | pass | Compare card: each column says its source ("Counted in this browser for this order…"; the automated run with its date and "Not shown: an automated run taps at machine speed"), reference order names come from menu data, no ratios. Cost evidence: `evidence/cost-per-order.json` matches the TESTING ledger (text median 90,393, voice 91,795 tokens; the "about 9,600 tokens" per call matches the first call's 9,620 prompt tokens); prices left null with "fill from the official page". No real brands. MALO placeholder cut below 390px (I-133 reopened) |
| H First 20 seconds | pass | `/` hero capture readable; D2 at 1440×900 opens with the scenario guide; D3 card readable but needs a scroll in the phone column (I-141) |
| I Rules | pass | R-006 (pill and banners have their own rows), R-007 (ticket wording on phone and kiosk), R-009 (`toBeInViewport({ ratio: 1 })` on [Yes, pay now] at all judge sizes). New: R-010 (proposed) |

Not bugs, seen in the review: D3 in QA shows "Messages to the AI: 0" and D2 shows "What the AI did: Nothing yet" because the QA spec drives the order through `/api/command`, not chat (`e2e/demo-compare.spec.ts` checks the real counts); "Voice is busy right now" on MALO D2 shots comes from the QA state that mocks a 429. The kiosk cart chip row cut at its right edge scrolls sideways by design (I-117).

## REVIEW.md items verified on the new screenshots
Fresh-eyes review by a separate agent, then re-checked here.
- **Verified:** K1, K2, K3, K4, K7, K8, K10, X1, X3, X4, X6, X7, X8, X9, X10, X11, X12 (after this step's scroll fix).
- **Partly, as the steps reported:** K5 (QR and [처음으로] added; dine cards still leave the lower K2 empty), K6 (widget strip verified; page text I-096 open), X2 (guide open at 1440; "Play it for me" needs a scenario chosen), X5 (I-123 open).
- **Not captured:** X13 (`/demo` below 900px has no QA state).
- **Decided, no fix:** K9 (I-039).

## Issues
New: I-140, I-141, I-142. New occurrences: I-075, I-121 (fixed), I-123, I-133 (reopened). Rule: R-010 (proposed) from `qa-screenshot-artifact` (I-121, I-138).
