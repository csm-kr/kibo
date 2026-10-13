# Step 1: flow-polish

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. UI_GUIDE "Phone design", UX, USER_JOURNEY J1 and J3, UI_QA.
- `docs/plan/judges/JUDGE_QA.md` rows D3–D7; `docs/plan/judges/ux/REPORT.md` (fixes 5–8 and "Smaller items", walk logs a and c).
- Code: `src/components/assistant/AssistantPanel.tsx`, `src/components/phone/*`, `src/components/demo/*` (DemoEndCard, CompareCard, D1 intro), `src/lib/agent/instructions.ts` (reply wording only).

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
Judges hit small dead ends inside their 3 minutes: end actions below the fold, 1.3–2.3 s with no feedback after sending, a pay button disabled for 1.5–1.9 s with no reason, an upsell with no "No thanks", choice buttons without prices, the cart total off-screen at 360 px with larger text, and `/demo` on a phone saying "on the right / on the left".

## Task
1. **D3:** when the end card appears, keep [Try again] and "Try another place" in view (scroll the phone column to them or pin them in the dock); in "Touch vs talk" hide the talk seconds when there is no touch time to compare.
2. **Instant feedback:** within 300 ms of a send, show the working state on the phone and a small "KIBO is working…" in the kiosk toolbar area (D2 and two-device); no gap without feedback.
3. **Confirm card:** never show [Yes, pay now] disabled without a reason: accept the tap as soon as the card is shown (the server rules stay), or label the wait ("One moment…") if a wait is required by the server's 1.5 s rule for spoken yes (taps are not delayed).
4. **Choices and upsell:** every upsell offer gets a [No thanks] / [괜찮아요] button; choice buttons show the price from menu data ("불고기버거 · 5,200원"); replies never use internal words ("confirm card", "확인 카드", "Please wait a moment" after the item is already added) — adjust instructions and add grounding/eval checks if the repo has them.
5. **Small phones:** at 360×800 with larger text, show a sticky one-line cart summary above the dock ("내 주문 1개 · 7,200원 ›", tap scrolls to the cart); while the keyboard is open, shrink the dock (hide the 88 px mic); the input placeholder is not cut off.
6. **`/demo` below 900 px:** say "Open this on a laptop to see the kiosk and the phone side by side" on D1 right away and drop "on the right / on the left" there.
7. `/app`: the code placeholder reads "6 digits" (not "000000").
8. **One QR, tall kiosk (owner, 10-14: "the kiosk should be tall, and the second QR on the right looks odd"; the UX judge said the same):** on a landscape screen (`/kiosk` laptop mode and `/demo` "Use my phone instead") the kiosk canvas is the hero: portrait, as tall as the viewport allows, centered or left-weighted; the KIBO side panel **never repeats the QR or the 6-digit code** (they live on the kiosk's own K1 screen and QR sheet, like a real kiosk). The panel becomes a slim status column: KIBO mark, "Order by talking: scan the QR on the kiosk or open kibo-2026.web.app and type the code shown there", connection state, and once connected the live order line ("Ordering · 2 items · ₩13,800 · Confirmed by you"). Update the pairing E2E/QA tests that expected the panel QR; screenshots at 1440×900 and 1920×1080 (waiting, connected).
Tests for logic changes first; QA screenshots for every changed state.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run qa:ui
```

## Verify
1. Run the AC commands; 0 H on changed screens.
2. Check: the payment rule holds (server tests unchanged and passing).
3. Update this step in `phases/14-final/index.json`.

## Do not
- Do not change the server's confirm rules.
- Break existing tests.
