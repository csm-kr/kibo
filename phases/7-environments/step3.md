# Step 3: kiosk-generalize

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: UI_GUIDE (all; kiosk text ≥ 40px on the 1080×1920 canvas), UX "Screen map" K1–K8, "Copy"; ISSUE I-019 (English kiosk UI, deferred until now: the user asked for broader environments, and airport machines offer English); UI_QA "KIBO numbers".
- Code: `src/components/kiosk/*`, `src/lib/kiosk/*`, `src/lib/i18n/{kiosk,errors}.ts`, `src/app/kiosk/page.tsx`, `data/kiosks/airport_rail.json`, `public/kiosks/airport_rail/*`, `e2e/kiosk-*.spec.ts`, `e2e/qa/kiosk.qa.spec.ts`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Make the kiosk screens work for any direct kiosk in the data, and give the kiosk an English mode.

### Ticket domain
- `kioskScreen()` skips K2 when the kiosk has no `dineOptions` (touch start goes straight to the menu; tests first).
- Tiles: pictogram or photo (`object-fit: contain` for SVG pictograms on a tinted panel), name, `subtitle` line when present, price (fares show "부터"/"from" only if the item has cheaper passenger options), kcal only when not null.
- K4 sheet: no variant step when an item has one variant; steps from option groups (`passenger`, `seat`, `top_up`) with the same step label; quantity on the last step labelled by the vocabulary ("승차권 수" / "Tickets").
- Cart bar, review, payment and done screens use `vocabulary` words (no "메뉴 담기" on a ticket machine); the done screen for tickets says "승차권을 받아 가세요" / "Please take your tickets" with the order number as a reference number.
- Theme colors come from `--k-*` variables already; check nothing is hard-coded to MALO teal or mustard.

### English kiosk mode (I-019)
- K1's language row: 한국어 / English buttons that work (local state for this order; reset to the kiosk's default `locale` when a new session starts). Only languages in `kiosk.locales`.
- Every kiosk string in `src/lib/i18n/kiosk.ts` must have a natural English version; names from `name.en`; prices "₩4,900" in English mode and "4,900원" in Korean.
- MALO gets `locales: ["ko", "en"]` in its data. The killer scene still works: the kiosk starts in Korean, and the phone speaks the user's language; switching the kiosk to English is the kiosk's own feature. Update I-019 to "fixed" with this decision and adjust `docs/PRD.md` "Languages" and `docs/USER_JOURNEY.md` J2 in one sentence each (R-002).

### Tests and QA
- Unit: `kioskScreen` without dine options; price formatting per locale; every kiosk string has ko and en.
- E2E: `e2e/kiosk-rail.spec.ts`: `/kiosk?k=airport_rail` touch flow: express → passenger adult → qty 2 → select; all-stop to Harbor Gate → child → select; review shows both lines and the server total; card → reference number. And one MALO run in English mode (K1 → English → order a cheeseburger set with zero cola → English review).
- QA: extend `e2e/qa/kiosk.qa.spec.ts` with airport_rail K1, K3, K4 (passenger step), K6 and MALO K1/K3 in English at 1080×1920; all H checks must pass (text ≥ 40px on the canvas, targets, contrast with the navy theme).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run qa:ui
```

## Verify
1. Run the AC commands; fix H failures on the changed kiosk screens.
2. Look at the airport K1 and K3 screenshots: does it read like a real ticket machine, not a burger kiosk with a new color?
3. Update this step in `phases/7-environments/index.json` (completed + summary / error / blocked).

## Do not
- Do not fork the kiosk components per kiosk; one set of components driven by data.
- Do not change MALO's Korean default or its flow.
- Break existing tests.
