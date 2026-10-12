# Step 1: polish-kiosk

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt (UI_GUIDE, UX, UI_QA matter most).
- `phases/9-polish/REVIEW.md` (step 0): the **kiosk** group of the punch list.
- Code: `src/components/kiosk/*`, `src/components/learned/*`, `src/lib/kiosk/*`, `src/lib/i18n/kiosk.ts`, `data/kiosks/*.json`, `e2e/qa/kiosk.qa.spec.ts`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Fix the kiosk group of the punch list, P0 first, then P1, then P2 as far as they are cheap. For each fixed item, mark the ISSUE row fixed with how. Items you cannot fix without a product decision: leave them open with a note.
Keep every written rule (text ≥ 40px on the canvas, targets, contrast, motion) and the existing flows; after the fixes, the E2E tests and `qa:ui` must still pass. Look at the new screenshots of every screen you changed before finishing.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run qa:ui
```

## Verify
1. Run the AC commands.
2. List in the summary which punch-list items were fixed and which remain.
3. Update this step in `phases/9-polish/index.json` (completed + summary / error / blocked).

## Do not
- Do not add features; polish only.
- Do not change server rules.
- Break existing tests.
