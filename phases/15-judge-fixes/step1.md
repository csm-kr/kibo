# Step 1: learned-and-rail

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. UX (Flow A, learned kiosk states), USER_JOURNEY (Mei, the visitor), KIBO_LEARN.
- `src/lib/agent/chat.ts`, the instructions, `src/lib/agent/tools.ts` (`setDineOption`, `offerChoices`, `callStaff`), the phone chat flow (`src/components/phone/*`, the hook that sends messages), `data/kiosks/airport_rail.json`, `skills/doughhouse.json`, `src/lib/adapters/learned.ts`.
- Step 0's summary in `phases/15-judge-fixes/index.json`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
- **Learned pizza kiosk drops a whole order** (UX judge, production): "One large pepperoni pizza with thin crust and extra cheese, and a cola" → the AI only asked "Eat here or take out?"; after tapping Eat here the cart stayed ₩0 and the user had to type it all again. This is the screen that showcases KIBO Learn.
- **Airport rail dead end** (UX and impact judges): "Two adult tickets to Seoul Station on the express train" → `callStaff` at once ("no information for Seoul Station"); "to the airport" was silently mapped to "Express to City Center". The machine sells tickets *from* the airport to City Center. Mei, the visitor, uses real place names.

## Task (tests first)
1. **Keep the order through the dine question.** When a request contains an order but the kiosk needs the dine choice first, the order must not be lost. Pick the simplest robust design and test it: e.g. the server keeps the request's parsed intent as a pending utterance on the session (short TTL) and, when the phone's dine tap arrives, the phone automatically re-sends that utterance (shown in the conversation as "Continuing your order…"), or the agent calls `setDineOption` from the user's words when they said it, and otherwise asks dine with `offerChoices` and re-runs the original message after the tap. It must work on the learned kiosk (Doughhouse) and on MALO, typed and voice where the same path applies. E2E: the pizza sentence then Eat here → the pizza is in the kiosk cart without retyping.
2. **Destinations the machine does not sell.** Instructions + tool use: when the user names a destination or ticket that is not in the data, say plainly what this machine sells (from the data, e.g. "This machine sells airport express tickets to City Center, 39 min, ₩10,500") and offer those as `offerChoices`, with "Call staff" as the last choice; never map silently to another destination. If a destination in the data is commonly called by another name, add an English alias in the data (data only, no invented stations).
3. **Eval cases**: pizza-order-before-dine (order survives the dine question), rail-unknown-destination-offers-choices, rail-to-the-airport-clarified. Run the eval once.
4. Docs: UX flow notes, USER_JOURNEY (Mei), ISSUE rows.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
```

## Verify
1. AC commands pass; the new tests failed before the change.
2. Update this step in `phases/15-judge-fixes/index.json`.

## Do not
- Do not change the payment rules or the bridge's forbidden-label rules.
- Do not invent destinations, aliases or items that are not in the data.
