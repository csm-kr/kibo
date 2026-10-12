# Step 2: assistant-ui

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: UX (all of "Flow A", "Exception flows", "Screen map" P1–P7 and PX, "Nielsen's 10 heuristics", "Accessibility", "Copy"); USER_JOURNEY J1 and J2; UI_GUIDE (phone: KIBO blue `#3446D4` for primary buttons, mic, selection, order number; radius 18/26px; anti-patterns); UI_QA "KIBO numbers" and "Visual standard" (phone rows); SECURITY "Identity and permissions" (claim token in the fragment, removed after claiming).
- Code: `src/lib/agent/{choices,mapping}.ts`, `src/app/api/chat/route.ts`, `src/lib/client/api.ts`, `src/hooks/useSessionStream.ts`, `src/lib/kiosk/` (`lineLabel`, `formatWon`), `src/components/kiosk/*` (patterns only), `e2e/qa/*` and `playwright.qa.config.ts` (UI QA from phase 2).
- Reference look: `design/prototype/Main.dc.html` phone section (intent only; its 44px buttons and 14–15px text break the rules, I-001/I-002).

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
The phone screen `/assistant` and the shared `AssistantPanel`, text mode first (voice comes in the next phase; leave a clearly marked slot for the mic button). Pure logic gets tests first.

### Pure logic (tests first): `src/lib/phone/`
- `phoneScreen(session, local) → "connecting" | "start" | "dine" | "talk" | "confirm" | "pay" | "done" | "ended" | "taken"`: from status and local flags (`claimError: "taken" | "gone" | null`, `startSeen`, `doneDismissed`). `connected` with no dine option → `dine` after the start screen (the user may also just talk; the dine screen has "Or just tell me your order"). `ordering` → `talk`; `confirming` → `confirm`; `paying` → `pay`; `paid` → `done` until dismissed; `expired` → `ended`.
- `phoneLocale(navigatorLanguage, stored?) → "ko" | "en"` (ko for `ko*`, everything else en; a stored choice wins).
- `useChat` reducer: messages kept in memory only, the last 10 turns sent as history, `utteranceSeq` +1 per sent message, busy flag.

### Strings: `src/lib/i18n/phone.ts`
All phone copy in `{ ko, en }` (plain, polite, one idea per sentence; buttons are verbs: [Undo], [Call staff], [Yes, pay now], [Pick more]).

### Claim and connection: `src/hooks/usePhoneSession.ts`
- `/assistant?s=<id>#t=<claim>`: if `localStorage["kibo.phone." + id]` holds a device token, reconnect with it; otherwise POST `/api/session/claim` with the fragment token, store the device token, then remove the fragment with `history.replaceState` right away. `CONFLICT` → "taken" ("Someone else is using this kiosk."), `GONE`/`NOT_FOUND` → "ended".
- Stream with `useSessionStream`; ping every 30 s with `active` = user did something in the last 30 s.

### `src/components/assistant/AssistantPanel.tsx` (shared with `/demo`)
Props: `{ kiosk; session; deviceToken; locale; onLocaleChange; mode: "phone" | "demo"; examples?: string[]; onCardStandIn?: () => void }`. Screens (phone sizes in CSS px at 390×844; body ≥ 20px, secondary ≥ 16px, totals ≥ 32px Space Grotesk 700, targets ≥ 56px, primary buttons full width and ≥ 60px, "Yes, pay now" ≥ 88px, side margin ≥ 16px):
- **Header (every screen):** KIBO mark, the kiosk's brand name, a language switch (한국어 / English), and **[Call staff]** always visible (`callStaff` with `user_request`, then a confirmation line).
- **P-start:** one sentence on what KIBO does here, three short steps (talk or type → the kiosk fills itself → confirm, then pay at the kiosk), [Start]. (The microphone hint P1 comes with voice in the next phase.)
- **P2 dine:** "Eat here or take out?" two large photo buttons (`setDineOption`, `source: "button"`), and "Or just tell me your order".
- **P3 talk:** the last two messages large (older ones collapsed behind "Earlier messages"), a "Working…" state after 1 s, the **cart card** (photo, name in the phone's locale, option line, qty, line price; total ≥ 32px; every line from session state, never from model text), **[Undo]** (`undoLastChange`, `source: "button"`), **choice buttons** from `session.pendingChoice` (question from `choiceQuestion`, labels from `choiceLabel`, photos where the menu has them, ≥ 56px; a tap sends its label to `/api/chat` as the next utterance; dine choices send `setDineOption` directly), example sentences as tappable chips (they fill and send the message), and the text input + [Send] (input ≥ 56px tall, 500-char limit). A marked slot for the mic button.
- **P4 confirm (status `confirming`):** every line and the total in large type, **[Yes, pay now]** (`confirmCheckout`, `source: "button"`, with the session's `cartVersion`), [Pick more] (`cancelCheckout`). "You can also say yes."
- **P5 pay (status `paying`):** "Insert your card into the kiosk" with an arrow illustration pointing toward the kiosk and the total; in `demo` mode also a [Tap the card on the kiosk] button that calls `onCardStandIn`.
- **P6 done (status `paid`):** order number 100–140px in KIBO blue Space Grotesk 700, "We'll call your number at the counter.", kept until the user taps [Done], which clears messages and the cart view.
- **P7 ended / taken** with one plain sentence and what to do next.
- **PX overlays:** idle warning one minute before `expiresAt` with [Continue] (`ping` active), "Reconnecting…" while the stream is not open, staff-called confirmation.
- Errors from commands or chat appear as plain sentences in the conversation (heuristic 9) using `errorCopy(code, locale, detail)` from `src/lib/i18n/errors.ts`, never codes or red alerts; `RATE_LIMITED` suggests the buttons.
- Accessibility: real buttons and inputs with labels; `aria-live="polite"` announces cart changes; focus moves to the confirm card when it opens; respects system font size (rem units).

### Page: `src/app/assistant/page.tsx`
Mobile layout, no horizontal scroll at 320px, `lang` from the phone locale. Phone mode examples (localized): "Two cheeseburger sets, one without pickles. Drinks zero cola and cider.", "Make both fries large.", "Is this halal?", "I'll pay."

### UI QA coverage
Add `e2e/qa/assistant.qa.spec.ts` to the existing QA suite: P-start, P2, P3 (empty, with 2 lines, with choice buttons after an `offerChoices` command sent through the API, error message), P4, P5, P6, P7 taken, PX idle warning if cheap, at 390×844, 360×800, 430×932 and 320 wide. Reach states via the API (kiosk token from a session you create, device token from the claim), not by calling the model.

### E2E
`e2e/assistant.spec.ts` (no model calls): claim through the QR URL, choose dine-in, an API-sent `addToCart` (as the AI would) shows in the cart card on the phone and on the kiosk page in a second tab, [Undo] removes it, `requestCheckout` shows the confirm card, [Yes, pay now] moves the kiosk to payment, a kiosk `cardAction` shows the order number on the phone; a second phone gets "Someone else is using this kiosk."

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run qa:ui
```

## Verify
1. Run the AC commands; fix H failures on the P screens.
2. Look at the P3 and P4 screenshots yourself: one focal point, cart readable on the phone alone, staff button visible.
3. Update this step in `phases/3-assistant/index.json` (completed + summary / error / blocked).

## Do not
- Do not render model text as HTML or put it into the session.
- Do not let the phone skip the confirm card: [Yes, pay now] is the only phone path to `paying` besides a fresh spoken yes.
- Do not store the conversation anywhere but React state.
- Do not use the kiosk palette for phone primary actions (KIBO blue there), or blue on the kiosk.
- Break existing tests.
