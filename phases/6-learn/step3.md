# Step 3: learned-assistant

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: UX "Exception flows" (learned kiosk replay fails), "Screen map" PX ("Please check the kiosk screen"); ARCHITECTURE "Commands and actors" (learned: 15 s without a report → phone message); PRD "Kiosks in the demo", "Must keep" 4; UX "Flow C".
- Code: `src/components/assistant/AssistantPanel.tsx`, `src/lib/phone/*`, `src/lib/i18n/phone.ts`, `src/app/demo/page.tsx`, `src/components/demo/*`, `src/components/learned/LearnedKioskHost.tsx`, `src/lib/agent/*`, `e2e/demo.spec.ts`, `e2e/qa/*`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
The phone and `/demo` for learned kiosks.

### Phone (`AssistantPanel`) on a learned kiosk
- While `pendingBridgeCommand` is set: a calm status "The kiosk is entering it…" on the cart card (no spinner longer than needed); after 15 s without a report: "Please check the kiosk screen." with [Call staff].
- `bridgeStatus.lastOk === false` or `staffCalled.reasonCode === "learned_mismatch"`: "The kiosk did not take that change. Please check the kiosk screen. Staff is on the way." and the cart card shows the session's (verified) cart.
- Confirm card (`confirming`): lines and total, then "Your order is on the kiosk. Tap **주문하기** (Order) on the kiosk and pay there." (label from the skill's checkout label), and [Pick more]. No [Yes, pay now] (learned sessions end at `confirming`).
- No [Undo] unless the last change was an add (server rule); hide what the server refuses.

### `/demo` kiosk picker
- D1 gets a small choice of kiosk under [Start]: "MALO BURGER — connected directly" (default) and "Doughhouse Pizza — learned by KIBO Learn, no integration". The choice is in the URL (`/demo?k=doughhouse`) so it can be linked.
- D2 with Doughhouse: the left half is `LearnedKioskHost` with the demo session and kiosk token as props; the assistant's examples change to pizza sentences ("A large pepperoni with thin dough and extra bacon", "Add a cola, 1.25 liters", "Remove the cola", "I'm done"); the caption bar says "Kiosk (unchanged third-party screen, learned once by KIBO Learn)".
- D3 for learned kiosks: after `confirming`, the end card says the user would now pay on the kiosk, with [Try again] and [Try MALO BURGER].
- The landing page `/` (if it exists) links "Try the learned pizza kiosk" → `/demo?k=doughhouse`.

### Tests
- Unit: `phoneScreen` and copy for pending, mismatch, and learned confirm states.
- E2E `e2e/demo-learned.spec.ts` (no model): `/demo?k=doughhouse` → Start → an API-sent add with the demo's device token → the iframe kiosk shows it, the phone cart shows it → `requestCheckout` → the learned confirm card without a pay button.
- `@live` (skipped unless `E2E_LIVE=1`): type "A large pepperoni with thin dough and extra bacon" → the kiosk's own cart gets the line.
- QA: add D2 with Doughhouse (1440×900) and the phone learned states to `e2e/qa/*`.

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
2. Check: the learned flow never offers payment on the phone; staff and "check the kiosk" appear on mismatch.
3. Update this step in `phases/6-learn/index.json` (completed + summary / error / blocked).

## Do not
- Do not show free text from the kiosk page on the phone.
- Do not change the MALO flow.
- Break existing tests.
