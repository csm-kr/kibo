# Step 4: cost-measure

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: TESTING "Measurements" (cost per session), "Evidence ledger"; ARCHITECTURE "Limits and cost"; RULE R-001; `docs/plan/SUBMISSION.md` (deck slot 10 "Cost": read it).
- Code: `src/lib/agent/{model,chat,live}.ts`, `scripts/eval-agent.ts`, `e2e/voice.live.spec.ts`, `evals/results/*`, `evidence/*`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Measure what one order costs in Gemini tokens, so the deck can state a sourced cost per session.

1. Text: extend the model client to return `usageMetadata` (prompt, candidates, thoughts, total tokens) per call without logging content; add `scripts/measure-cost.ts` (`npm run measure:cost`, `tsx --env-file=.env`) that runs the MALO hero order as a 4-message text conversation (order, fries large, no dessert, I'll pay) through `runChat` with a memory store, three times, and records tokens per call and per order.
2. Voice: if the Live API messages expose `usageMetadata` in the installed SDK, have the live E2E (or a small script with the voice fixtures) record total tokens for one hero order by voice; otherwise record "not exposed by the API" and the session duration only.
3. Prices: do **not** guess prices. Read the official Gemini API pricing page is not possible without network tools here, so record tokens only and leave `pricePerMTok` fields null with a note "fill from the official pricing page on the day of the deck"; the deck owner multiplies.
4. Save `evidence/cost-per-order.json` (model ids, date, runs, median tokens per text order and per voice order if available) and update the TESTING ledger row "Cost per session" (measured tokens, file path; price "to be filled from the official page").

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run measure:cost
```

## Verify
1. Run the AC commands; the evidence file exists with three runs.
2. Check no prompts, replies or keys are written to the evidence file.
3. Update this step in `phases/9-polish/index.json` (completed + summary / error / blocked).

## Do not
- Do not state a price you did not read from an official source (R-001).
- Break existing tests.
