# Step 4: kiosk-e2e

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: TESTING ("End to end", "Measurements", "Evidence ledger"), PRD "Demo scenario" step 2 (touch order), UX "Flow A", "Flow B"; RULE R-001.
- All kiosk code from steps 1–3: `src/app/kiosk/page.tsx`, `src/components/kiosk/*`, `src/lib/kiosk/*`, `src/lib/client/api.ts`, `src/hooks/*`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Browser end-to-end tests for the kiosk with Playwright Test, against the dev server with the in-memory store.

### Setup
- `npm install -D @playwright/test` and `npx playwright install chromium` (a cached Chromium may already exist).
- `playwright.config.ts`: `testDir: "e2e"`, Chromium only, `webServer: { command: "npm run dev -- --port 3100", url: "http://localhost:3100/api/health", env: { STORE: "memory" }, reuseExistingServer: false }`, `use.baseURL = "http://localhost:3100"`, traces on first retry.
- `package.json`: `"test:e2e": "playwright test"`. Make sure Vitest ignores `e2e/` (its include is `src/**`) and ESLint still passes.

### Tests
1. `e2e/kiosk-touch.spec.ts` (viewport 1080×1920): the **hero order by touch** on `/kiosk?k=malo&demo=1`: touch start → dine in → burger category → cheeseburger → set → side (keep fries M) → drink zero cola → ingredients no pickles → add → upsell "괜찮아요" → cheeseburger → set → drink cider → add → change both fries to large (open each line from the review or re-add as your UI allows; follow the simplest real kiosk path your UI offers) → order → review shows 2 lines and the server total → pay → card → card insert → approving → receipt "출력 안 함" → order number visible → countdown visible. Assert the total equals the server's total for that cart (14,800원 with both fries large) and read `data-taps` / `data-seconds`.
2. `e2e/kiosk-mirror.spec.ts`: open `/kiosk?k=malo`, read the claim URL from the QR's `data-claim-url`, claim it with `fetch` (as the phone), send `addToCart` with the device token and `source: "voice"`; the kiosk shows the menu, the highlighted tile and the status line "AI가 담았어요"; then `requestCheckout` from the phone → the kiosk shows the review; a phone `confirmCheckout` with `source: "button"` → the kiosk shows payment. Also: a second claim of the same QR gets 409 with "Someone else is using this kiosk."
3. `e2e/kiosk-states.spec.ts`: sold-out tile is not tappable and says 품절; a morning item outside its hours is marked unavailable (skip this assertion if the test runs between 05:00 and 10:30 KST); after `paid` the kiosk returns to the attract screen after the countdown with a new QR.

### Evidence
Write the measured touch run to `evidence/touch-hero.json`: `{ date, taps, seconds, total, note: "automated Playwright run on /kiosk, not a human timing" }`. Add a row to the `docs/TESTING.md` evidence ledger: "Touch hero order on /kiosk (automated tap count)" with the value and the file. Seconds from an automated run are not a human measurement: say so in the row (R-001).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
```

## Verify
1. Run the AC commands.
2. If a test exposes a kiosk bug, fix the kiosk code (that is in scope) and say so in the summary; log anything you could not fix in `docs/ISSUE.md`.
3. Update this step in `phases/2-kiosk/index.json` (completed + summary / error / blocked).

## Do not
- Do not point tests at Firestore or any external URL; `STORE=memory` only (I-006: tests never reach the network).
- Do not weaken assertions to make a flaky UI pass; fix the cause (waits on stream updates, not fixed sleeps, except the 10 s countdown).
- Do not publish a number without its evidence file (R-001).
- Break existing tests.
