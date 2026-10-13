# Step 0: kiosk-english

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. UI_GUIDE, UX (K-screens, D2, Flow C), USER_JOURNEY J2 and J3, UI_QA, RULE (all).
- `docs/plan/judges/JUDGE_QA.md` (rows D1, D2, B6, A2) and `docs/plan/judges/ux/REPORT.md` (fixes 2 and 4, walk logs a and b).
- Code: `src/components/kiosk/*` (highlight banner, review, payment screens), the learned kiosk's bilingual status bar (`src/components/learned/*`), `src/components/pairing/PairingPanel.tsx`, `src/components/demo/*` ("What the AI did" ActionStrip), `src/lib/kiosk/pairing.ts` (orderLine, "Last change: by …").

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
Three independent judge reviews (10-13) agree the product works, but an English-only judge cannot read what the Korean kiosk just did in the moment the demo says "watch the kiosk", and the panel says "Last change: by the AI" right after the **user** confirmed, which weakens the main safety promise.

## Task
1. **English subtitle on the kiosk (MALO and the airport rail machine, in `/demo`, `/kiosk` and two-device mode):** under every AI change banner ("AI가 담았어요: 치즈버거 세트") show an English line ("AI added: Cheeseburger set · Fries M · Zero cola · No pickles"), reusing the learned kiosk's bilingual bar pattern; the kiosk stays Korean-first (it stands for an existing Korean kiosk), the subtitle is a KIBO overlay, visually distinct, ≥ 18 px at 1080 px kiosk height.
2. **Payment steps explained in English** on the KIBO side (the D2 kiosk caption and the landscape PairingPanel): mirror the kiosk's step ("Kiosk: payment. Tap 카드 (Card), then 카드 넣기 (Insert card). Demo only, no money is charged.").
3. **Safety in the log:** after the user taps [Yes, pay now] (or says yes), add a row in "What the AI did": "You confirmed → confirmCheckout ✓ (needs your tap or a new 'yes')"; the PairingPanel/orderLine says "Confirmed by you" after a user confirm and "Paid at the kiosk · confirmed by you" once paid, never "Last change: by the AI" from `confirming` on (the video showed "Paid · order number 860 / Last change: by the AI", which contradicts the safety promise; `lastChange` is only recorded on cart changes, `src/lib/commands/machine.ts`). Tests first for the orderLine/actor logic.
4. **Wording:** never call Doughhouse "third-party": it is "our development pizza kiosk, learned by KIBO Learn" (landing, `/demo` place card, any copy); grep for "third-party" and fix each place.
5. QA: screenshots of D2 mid-order, D2 confirm, two-device payment step at 1440×900 and the kiosk at 1080×1920 with the subtitle; save to `phases/14-final/qa/`.

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
2. Check: the payment rule is unchanged (only labels and logs); no new Korean in repo files except UI strings.
3. Update this step in `phases/14-final/index.json` (completed + summary / error / blocked).

## Do not
- Do not translate the kiosk's own screens into English (it is the "existing Korean kiosk"); add KIBO subtitles instead.
- Break existing tests.
