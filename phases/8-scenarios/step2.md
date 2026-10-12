# Step 2: ai-actions

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: UX heuristic 1 (visibility of system status) and 8; SECURITY "Secrets and repo hygiene" (no utterances in logs; tool names and result codes only); ARCHITECTURE "Agent tools (9)", "Data flow"; `docs/plan/STRATEGY.md` (read it; judges score technical depth and "experience & integration").
- Code: `src/app/api/chat/route.ts`, `src/lib/agent/{chat,mapping}.ts`, `src/hooks/useLiveVoice.ts`, `src/lib/voice/toolRunner.ts`, `src/components/demo/*`, `src/components/assistant/AssistantPanel.tsx`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Make the AI's real actions visible on `/demo`, so a judge can see Gemini calling tools and the server checking them, live.

### Data
- `/api/chat` response gains `actions: [{ tool, args (ids only, no free text), code: "ok" | ErrorCode, pending?: boolean, ms }]` for the calls in that request (timings measured around each `runCommand`).
- Voice: `runToolCalls` reports the same shape to the UI through a callback.
- Nothing new is stored on the server or logged beyond tool names and codes.

### "What the AI did" strip (`/demo` only)
- Under the assistant or the kiosk (wherever it fits at 1440×900 without covering either), a compact, collapsible list "What the AI did" (open by default on screens ≥ 1440px wide, collapsed below; a count badge when collapsed). Each row in plain words plus the technical name in a smaller line: "Added 2 × Cheeseburger set (zero cola, no pickles) — `addToCart` ✓ 180 ms", "Asked which drink — `offerChoices`", "Tried to pay → the confirm card is required — `confirmCheckout` refused (CONFLICT)", "Called staff — `callStaff`". Names come from menu data via `choiceLabel`/`lineLabel`; never model text.
- A one-line legend: "Gemini decides; the KIBO server checks every action against the kiosk's data and rules before the kiosk moves."
- Accessible: a list with labels; not announced by `aria-live` (the cart announcements already are).
- The phone `/assistant` does not show this strip (the user does not need it; heuristic 8).

### Tests
- Unit: `actions` are produced with ids only and codes for success, `NEEDS_CHOICE`, and `CONFLICT`; the row text builder for each tool.
- E2E (no model): a fake-model test hook is not allowed in production code, so test the strip by rendering it with recorded `actions` arrays in a component test (Vitest + React Testing Library if already available; otherwise a Playwright test page under `e2e/` only).
- QA: D2 with the strip open after a scenario step at 1440×900 and collapsed at 1280×720.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run qa:ui
```

## Verify
1. Run the AC commands.
2. Check: no utterance text, model text, ids of sessions or tokens appear in the strip or the response `actions`.
3. Update this step in `phases/8-scenarios/index.json` (completed + summary / error / blocked).

## Do not
- Do not add "Powered by AI" badges; describe what happened (UI_GUIDE anti-patterns).
- Do not log or persist conversation content.
- Break existing tests.
