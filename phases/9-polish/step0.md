# Step 0: design-review

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. All of UI_GUIDE, UX, USER_JOURNEY and UI_QA matter here; `docs/plan/STRATEGY.md` (read it: Best UI/UX special award, what judges look for).
- Previous QA reports: `phases/*/qa/REPORT.md`; open UI rows in `docs/ISSUE.md`.
- The QA suite: `playwright.qa.config.ts`, `e2e/qa/*`. The reference prototype: `design/prototype/Main.dc.html`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
Every phase checked its own screens. Nobody has yet looked at the product as a whole, as a judge would, with fresh eyes. This step only **reviews**; the next steps fix.

## Task
1. Run `npm run qa:ui` (branch `feat-9-polish` writes to `phases/9-polish/qa/`), then run it again with `QA_ALL=1` through a `node` script that sets the variable for a child process (the harness cannot prefix env vars) to collect every T miss.
2. Look at **every** screenshot at its main viewport: K1–K8 and KX for each kiosk (MALO Korean and English, airport_rail), the learned host, P1–P7 and PX, D1–D3 for each environment, the scenario guide, the AI actions strip, and the landing page. For each, apply UI_QA "Visual heuristics" V1–V12 and the UI_GUIDE anti-patterns, and compare consistency across screens (V4: header, staff button, cart bar, primary button in the same place everywhere; same names and price format on phone and kiosk).
3. Walk the journeys J1–J3 end to end on the real screens (E2E tests and screenshots) and note every place a person would hesitate.
4. Write `phases/9-polish/REVIEW.md`: a punch list ranked P0 → P2, each item with screen id, what is wrong, the evidence (screenshot file, measured value, file:line), and the concrete fix; group by **kiosk** (for step 1) and **phone, `/demo`, landing** (for step 2); at most 25 items in total, the ones that change a judge's impression first. Also log each item in `docs/ISSUE.md` (reuse classes; a 3rd occurrence adds a rule).
5. Do not change product code in this step.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run qa:ui
```

## Verify
1. `phases/9-polish/REVIEW.md` exists with the two groups and evidence for every item.
2. Update this step in `phases/9-polish/index.json` (completed + summary with the top 5 items / error / blocked).

## Do not
- Do not fix anything here; the review must be independent of the fixes.
- Do not list taste-only remarks without a rule or a journey behind them.
