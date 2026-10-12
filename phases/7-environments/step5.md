# Step 5: environment-demo

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: UX "Flow C", USER_JOURNEY J2 (Mei) and J3 (judge), UI_QA angle H; PRD "Kiosks in the demo", "Business model".
- Code: `src/app/demo/page.tsx`, `src/components/demo/*`, `src/app/page.tsx` (landing), `src/lib/agent/examples.ts`, `src/components/assistant/AssistantPanel.tsx`, `src/components/learned/LearnedKioskHost.tsx`, `e2e/demo*.spec.ts`, `e2e/qa/*`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Let a judge pick an environment and see the same phone experience drive a different kiosk.

### `/demo` environment picker (D1)
Replace the small kiosk choice with three equal cards, each a real screenshot or pictogram, a title, one line, and the persona it serves:
1. **Burger shop** — "MALO BURGER · connected directly" — Sunja (72) orders lunch in one sentence. (`/demo?k=malo`, default)
2. **Airport rail** — "SKYLINE AIRPORT RAIL · ticket machine" — Mei, a visitor, buys tickets in English while the machine shows Korean. (`/demo?k=airport_rail`)
3. **Pizza shop, no integration** — "Doughhouse · learned by KIBO Learn" — KIBO learned this third-party screen once and replays orders without AI. (`/demo?k=doughhouse`)
[Start] uses the selected card; the URL carries the choice so links work. Keep the D1 rule: one primary action, readable in 20 seconds.
- D2 shows the matching kiosk on the left (`KioskScreen` for direct kiosks, `LearnedKioskHost` for learned), the assistant on the right with `examplesFor(kioskId, "en")`, and the caption bar naming the environment.
- D3's end card offers "Try another place" with the two other environments.

### Landing page
Add a section "One phone, many kiosks" with the three environments (real screenshots captured by `npm run shots:landing`, extended for airport_rail), each linking to its `/demo?k=…`. Mention roadmap places (hospitals, civil-service offices, cinemas) as roadmap in one plain line, no claims.

### Tests and QA
- E2E `e2e/demo-airport.spec.ts` (no model): `/demo?k=airport_rail` → Start → API-sent tickets via the demo's device token appear on both halves → confirm card → stand-in card → reference number.
- `@live` (skipped unless `E2E_LIVE=1`): type "Two adult tickets to City Center on the express" → two adult express tickets in the cart.
- QA: D1 with the three cards and D2 for airport_rail at 1440×900, 1280×720, 1920×1080; landing section at 1440×900 and 390×844.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run qa:ui
```

## Verify
1. Run the AC commands; run `npm run test:e2e:live` once and report.
2. As a cold judge at 1440×900: can you tell in 20 seconds that these are three different places and the phone works the same in each?
3. Update this step in `phases/7-environments/index.json` (completed + summary / error / blocked).

## Do not
- Do not fake environments with screenshots only; each card opens a working kiosk.
- Do not add more than one primary button on D1.
- Break existing tests.
