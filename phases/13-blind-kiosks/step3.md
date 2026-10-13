# Step 3: baseline-b

## Read first
- Everything listed in step 1 of this phase (`phases/13-blind-kiosks/step1.md`), and the summaries of steps 1 and 2 in `phases/13-blind-kiosks/index.json` (step 2 fixed the I-185 crash and re-ran the bk1/bk2 baselines).

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
**First (orchestrator, 10-13):** step 1's crashed bk2 rerun wrote `learn-stats.json` at 20:56 but its `learner.mjs` process (and the headless browser) never exited, which kept the step's session open for 12 more minutes until the orchestrator killed it. Before running, check that `learner.mjs` closes the browser and exits on every path (finished, crash, token cap, turn cap); if step 2 did not already fix that, fix it with an AI-free test (no change to how the learner explores), and run each learner with a hard wall-clock limit in your spawn wrapper (kill after 30 min) so a hang cannot block the phase.

Exactly step 1's procedure for `bk3-ramen` and `bk4-airport-shop` (baseline: the learner with step 2's crash fix and nothing else, one run each, results under `spikes/blind-kiosks/results/<kioskId>/baseline/`).
Then write `spikes/blind-kiosks/results/BASELINE.md`: one table with all four kiosks (finished through the gate, minutes, input tokens, item recall, price accuracy, option groups exact, orders correct / safe refusal / unsafe) (use the new `baseline/` runs; mention the crashed first runs in `baseline-crashed/` in one line) and a list of the **failure patterns** seen across kiosks (for example quantity options, navigation steps recorded as options, conditional groups, paging, icon-only tabs, native alerts, promotions), each with the kiosks and log lines where it happened. This list is the input for step 4, which must fix patterns, not kiosks.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. Four baseline folders and `BASELINE.md` exist.
2. Update this step in `phases/13-blind-kiosks/index.json` (completed + summary / error / blocked).

## Do not
- Do not change the learner, driver, runner or audit in this step.
- Do not rerun to get a better number.
