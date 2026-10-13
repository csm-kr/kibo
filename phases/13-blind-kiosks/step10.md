# Step 9: report

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. KIBO_LEARN "Results so far", TESTING "Evidence ledger", RULE R-001, `docs/plan/DECK_FACTS.md`, `README.md` evidence table, the landing page's evidence numbers (`src/app/page.tsx`).
- All of `spikes/blind-kiosks/results/` (baseline, dev, final), `spikes/blind-kiosks/PROTOCOL.md`, `spikes/kibo-learn/CHANGES.md`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
1. `spikes/blind-kiosks/RESULTS.md`: the protocol in three sentences; a table per kiosk (baseline → final: finished through the gate, minutes, input tokens and cost from the official price in `evidence/cost-per-order.json`'s price notes for `gemini-3.8-flash`, item recall, price accuracy, option groups exact, orders correct / safe refusal / **unsafe**); totals across the four kiosks; what improved and what did not; plain limits (synthetic kiosks built by AI agents, web only, one run each, Gemini on one day). Every number links to its file.
2. Update `docs/KIBO_LEARN.md` ("Results so far", "Known gaps"), the `docs/TESTING.md` ledger, `docs/plan/DECK_FACTS.md` (slot 12 "Benchmarks"), the README evidence table and, only if the final results are worth showing, one line on the landing page (for example "learned 4 kiosks it had never seen: N of 40 test orders correct, 0 placed wrongly"), all with file paths (R-001). If unsafe > 0 anywhere, say so wherever the result is quoted.
3. **Optional product addition:** (step 8's viewer links to it when added) if a final kiosk has **unsafe = 0** and **correct ≥ 8 of 10**, add it as a learned kiosk in the product the way Doughhouse is (`public/learned-kiosks/<id>/`, reviewed `skills/<id>.json` with English names, `/demo` place card "Learned in N minutes, never seen before"), with E2E coverage like `e2e/demo-learned.spec.ts`. Otherwise skip and say why.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
```

## Verify
1. Every number in the changed docs and pages points to a results file.
2. Update this step in `phases/13-blind-kiosks/index.json` (completed + summary / error / blocked).

## Do not
- Do not round numbers into stronger claims ("almost all", "works on any kiosk").
- Do not hide unsafe results.
- Break existing tests.
