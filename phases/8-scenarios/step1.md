# Step 1: scenario-panel

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: UX "Flow C", heuristic 8 (minimalist) and 10 (help); USER_JOURNEY J3; UI_QA angle H and "Visual standard" (motion, time limits).
- Code: `src/lib/demo/scenarios.ts`, `src/app/demo/page.tsx`, `src/components/demo/*`, `src/components/assistant/AssistantPanel.tsx` (how a message is sent; `useChat`), `src/lib/agent/examples.ts`, `e2e/demo*.spec.ts`, `e2e/qa/demo.qa.spec.ts`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
A scenario guide in `/demo` and a "Play it for me" mode that drives the real agent.

### Scenario guide (D2)
- A [Scenarios] button in the D2 header opens a side sheet or a collapsible column (it must not cover the kiosk or the assistant input at 1440×900). It lists `scenariosFor(kioskId)` as cards: title, persona, goal, tags as small labels (text, not color alone).
- Choosing a scenario starts a **fresh demo session** (same as [Try again]) and shows its steps as a checklist: each step's sentence as a tappable chip (tap = send it as the user's message), the "watch" hint under it, and a check mark that ticks by itself when `stepDone` is true for the live session. At the end: "Your turn: tap **Yes, pay now** on the phone, then the card on the kiosk." (the scenario stops before payment).
- Example chips in the assistant stay as they are; the scenario guide is an extra, not a replacement.

### Play it for me
- In a scenario: [Play it for me] sends each step's sentence through the same path as typing (real `/api/chat`, real Gemini), waits until the step's check passes or 20 s pass, pauses 1.5 s so a viewer can watch the kiosk, then continues. [Stop] at any time. It never sends anything after `confirming` and never taps confirm or the card. If a step fails (timeout or an error), it stops and shows "This step didn't go as expected. You can type it yourself or try again." (no retry loops).
- Respect limits: a played scenario uses at most its number of steps in messages; show a plain message if the demo message limit is reached.
- While playing, the assistant shows the sentences as user messages exactly as if typed (nothing fake).

### Tests
- Unit: the player's state machine (idle → sending → waiting → paused → done/stopped/failed) with a fake send and fake session updates; it never sends after `confirming`.
- E2E (no model): open the guide, choose MALO scenario 4 ("Is this halal?"), simulate the agent by sending `callStaff` through the API with the demo's device token → the step ticks.
- `@live` (skipped unless `E2E_LIVE=1`): play MALO scenario 1 → reaches `confirming` with 2 lines and large fries.
- QA: D2 with the guide open and a scenario half done at 1440×900, 1280×720, 1920×1080.

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
2. Check: the guide is optional and closed by default; nothing in it pays or confirms.
3. Update this step in `phases/8-scenarios/index.json` (completed + summary / error / blocked).

## Do not
- Do not record or replay canned AI responses; every step goes through the real agent.
- Do not auto-confirm or auto-pay, ever.
- Break existing tests.
