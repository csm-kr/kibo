# Step 10: report

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. KIBO_LEARN "Results so far", TESTING "Evidence ledger", RULE R-001, `docs/plan/DECK_FACTS.md`, `README.md` evidence table, the landing page's evidence numbers (`src/app/page.tsx`).
- All of `spikes/blind-kiosks/results/` (baseline, dev, final), `spikes/blind-kiosks/PROTOCOL.md`, `spikes/kibo-learn/CHANGES.md`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
0. **Grader fix first (orchestrator, 10-14; grader only, no learner change, no new learner runs):** on `bk6-themepark` the kiosk total matched the answer key in 10 of 10 final orders, but every order was graded unsafe because the grader's "cart lines" were the category tabs: the cart is a closed slide-in drawer, so it read nothing from the cart (I-183, raised to P1). Make the grader read the real cart: when no cart lines are visible after an order, open the cart the way a person would (the cart button/drawer, found by the answer key's flow or a generic `장바구니`/`Cart` control; the grader is not bound by the skill's `forbiddenLabels`), read its lines, then compare. Test it on a dev fixture with a drawer cart (AI-free). Re-grade **every** baseline and final run with the fixed grader into `grade-v2.json` next to each `grade.json` (keep the old files) and report both columns where they differ. Also note I-197 (the skill's own total differs from the kiosk in 4 of 10 bk6 orders) and the bk2 mid-line modal limit (I-194) plainly.
0b. **`/learn` run choice:** step 9 picked bk4 (not a first sighting) and Doughhouse. After the re-grade, if a **fresh** kiosk (bk5-restarea or bk6-themepark) has unsafe = 0 and correct ≥ 8 of 10 under `grade-v2.json`, add its final trace as the **first** `/learn` card (`npm run learn:runs`, same rules: unedited turns, provenance text "built by a separate AI agent and added to the repo only after the learner fixes; never seen before this run"), keep bk4 as the second. If none qualifies, keep step 9's choice and say why in RESULTS.md.
1. `spikes/blind-kiosks/RESULTS.md`: the protocol in three sentences; a table per kiosk (baseline → final: finished through the gate, minutes, input tokens and cost from the official price in `evidence/cost-per-order.json`'s price notes for `gemini-3.8-flash`, item recall, price accuracy, option groups exact, orders correct / safe refusal / **unsafe**); totals across the four test kiosks, **a separate section for the two fresh hold-out kiosks (bk5-restarea, bk6-themepark: added after the learner fixes, the cleanest 'never seen' result)**, and the labelled bk2 after-fix rerun next to (not replacing) bk2's final; what improved and what did not; plain limits (synthetic kiosks built by AI agents, web only, one run each, Gemini on one day). Every number links to its file.
2. Update `docs/KIBO_LEARN.md` ("Results so far", "Known gaps"), the `docs/TESTING.md` ledger, `docs/plan/DECK_FACTS.md` (slot 12 "Benchmarks"), the README evidence table and, only if the final results are worth showing, one line on the landing page (for example "learned 4 kiosks it had never seen: N of 40 test orders correct, 0 placed wrongly"), all with file paths (R-001). If unsafe > 0 anywhere, say so wherever the result is quoted.
3. **Optional product addition:** (step 9's viewer links to it when added) if a final kiosk has **unsafe = 0** and **correct ≥ 8 of 10**, add it as a learned kiosk in the product the way Doughhouse is (`public/learned-kiosks/<id>/`, reviewed `skills/<id>.json` with English names, `/demo` place card "Learned in N minutes, never seen before"), with E2E coverage like `e2e/demo-learned.spec.ts`. Otherwise skip and say why.

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
