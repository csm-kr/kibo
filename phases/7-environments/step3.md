# Step 3: agent-domains

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: ARCHITECTURE "Agent tools (9)"; PRD "Data principle"; TESTING "Agent evaluation set"; RULE R-001.
- Code: `src/lib/agent/*` (instructions, tools, menu, mapping, choices, chat, live), `evals/agent-cases.json`, `scripts/eval-agent.ts`, `evals/results/*`, `data/kiosks/airport_rail.json`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
The agent must sound right and act right on every kiosk, not only the burger shop.

### Instructions and tools
- `buildInstructions` uses the kiosk's `domain` and `vocabulary`: for `ticket` kiosks, talk about tickets, destinations and passengers; never ask "eat here or take out"; map "two adults and a child" to two `addToCart` calls (`passenger` adult qty 2, child qty 1); ask which destination when unclear (`offerChoices` pick_item with the matching trains); for a transit card ask the top-up amount; information not in the data (platform numbers, train times, delays, luggage rules) → say the machine does not have that information and call staff (`unknown_info`).
- `toolDeclarations` omits `setDineOption` when the kiosk has no `dineOptions`.
- Example sentences per kiosk come from one place (`src/lib/agent/examples.ts`: `examplesFor(kioskId, locale)`), used by `/demo` and the phone: MALO (existing), Doughhouse (existing pizza lines), airport_rail ("Two adult tickets to City Center on the express, please.", "Add one child ticket too.", "Which platform is it?", "I'll pay."; Korean versions).
- `choiceQuestion` covers the new groups (passenger, seat, top-up) in ko and en.

### Evaluation
- Add 8–10 airport cases to `evals/agent-cases.json` (ko and en): adults + child, destination ambiguity, transit card without top-up (choices), sold-out item (alternatives), platform question (staff), a request for a real-world thing not in data (refuse), "I'll pay" (status `confirming`). The runner must support a `kioskId` per case (default `malo`).
- Run `npm run eval:agent` (real Gemini). Tune instructions at most 2 rounds if airport cases fail; MALO's pass rate must not drop. Update the TESTING ledger row with the new overall and per-kiosk pass rates and the result file (R-001).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run eval:agent
```

## Verify
1. Run the AC commands; report per-kiosk pass rates in the summary.
2. Check: no instructions mention real stations, operators or schedules; replies are grounded in data.
3. Update this step in `phases/7-environments/index.json` (completed + summary / error / blocked).

## Do not
- Do not change server rules to make cases pass.
- Do not add languages beyond Korean and English.
- Break existing tests.
