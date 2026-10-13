# Step 2: polish-phone

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt (UI_GUIDE, UX, USER_JOURNEY, UI_QA matter most).
- `phases/9-polish/REVIEW.md` (step 0): the **phone, `/demo`, landing** group of the punch list.
- Code: `src/components/assistant/*`, `src/components/demo/*`, `src/app/{assistant,demo}/page.tsx`, `src/app/page.tsx`, `src/lib/i18n/*`, `src/lib/phone/*`, `e2e/qa/*`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
First, two decisions made on 10-13 by the orchestrating session (the user delegated decisions), left open by step 1:
- **I-048 / REVIEW K5:** add a [처음으로] / [Start over] button on the standalone kiosk's K2–K4 (bottom-left, secondary style, ≥ 64px, ≥ 40px text): with an empty cart it returns to K1 at once; with items it asks "주문을 취소하고 처음으로 갈까요?" [취소하고 처음으로] [계속 주문]. It ends the session the way the kiosk already does after payment (`onNewSession()`: new session, new QR), never through a payment path. Hidden in `/demo` (the judge's session must not be dropped). Unit-test the screen logic; extend the kiosk QA spec with the dialog state; mark I-048 fixed.
- **I-039 / REVIEW K9:** no option editing on kiosk cart lines (real kiosks delete and re-add); mark I-039 "decided: won't do", pointing to the fair touch measurement in step 3.

Then fix the phone, `/demo` and landing group of the punch list, P0 first, then P1, then cheap P2 items. For each fixed item, mark the ISSUE row fixed with how; leave decision-dependent items open with a note.
Keep every written rule (phone body ≥ 20px, secondary ≥ 16px, targets ≥ 56px, mic and pay ≥ 88px, KIBO blue only for primary actions, one task per screen) and the flows; after the fixes the E2E tests and `qa:ui` must pass. Look at the new screenshots of every screen you changed, at 390×844 and 320 wide for the phone and 1440×900 for `/demo`.

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
