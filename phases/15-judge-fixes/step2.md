# Step 2: phone-ux

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. UI_GUIDE, UX (phone screens, `/demo`), UI_QA.
- `src/components/phone/*` (AppBar, Dock, Conversation, Choices, Checkout, language.tsx), `src/components/demo/*`, `src/app/assistant/*`, `src/app/app/*`, the settings store for text size, `src/lib/i18n/phone.ts`.
- UX judge screenshots if present: `videos/orchestrator/judges-r2/ux/shots/` (git-ignored).

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why (UX judge 7.5/10, production, 10-14 night)
1. **In `/demo` the phone's blue "Insert the card at the kiosk" button pays**: it sends the kiosk's `cardAction` from the phone panel (`shots/16-phone-insert-btn-clicked.png`). The main promise is "only the kiosk takes payment"; a judge taps the obvious blue button and watches the phone pay.
2. **"Larger text" is unreachable on the QR path**: only at the bottom of `/app`; `/assistant` (where a QR scan lands) has no text-size control (`shots/90-qr-claim-landing.png`). Low vision is one of the three personas.
3. **Small phones hide the AI's questions**: at 360×800 with larger text the composer, mic, "Voice on" and the "Your order" pill take ~40% of the height; choice buttons render under them (`shots/41-small-sprite-reply.png`); on the Japanese confirm screen the AI's reply sat under the sheet (`shots/31-phone-confirm-ja.png`).
4. In an AI-only language the AI says "tap Yes, pay now" while the button reads "はい、支払います".
5. Smaller: `/demo` intro says "type on the right" but the phone is the middle column; "Close" next to the mic only hides the keyboard; landing diagram says `/assistant` while users go to `/app`.

## Task
1. `/demo`: move the card stand-in to the kiosk side: a control drawn under or on the kiosk panel, styled as part of the kiosk and labelled "Kiosk: insert card (demo)"; the phone panel shows instruction text only ("Insert your card at the kiosk"), no button that sends `cardAction`. Keep two-device mode unchanged (the phone already has no pay button there). Update E2E that clicked the old button.
2. Text size on every phone screen: an "Aa" control in the phone header next to the language button (or a "Language and text size" sheet), remembered in phone settings, available on `/assistant`, `/app` and `/demo`'s phone. 44+ px target, labelled for screen readers.
3. Keep the AI's last reply and its choice buttons fully visible above the bottom sheet after each reply (scroll into view), hide the "Your order" pill while choices are showing, and at larger text on ≤ 380 px wide phones move "Voice on" into the header. Add a QA state that asserts the last choice button is not covered.
4. Replies name buttons by the label the user sees: pass the visible label for "Yes, pay now" in the current AI language to the instructions or the confirm-card reply (from `lt()`), so the AI says the on-screen words.
5. Copy fixes: `/demo` intro "type on the phone in the middle" (or position-free wording), "Close" → "Hide keyboard" (or an icon with that label), landing diagram path `/app`.
6. QA pass on changed screens (docs/UI_QA.md), screenshots in `phases/15-judge-fixes/qa/`.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run qa:ui
```

## Verify
1. AC commands pass, 0 H on changed screens.
2. Update this step in `phases/15-judge-fixes/index.json`.

## Do not
- Do not let any phone control send `cardAction`.
- Do not change the kiosk's own Korean UI labels.
