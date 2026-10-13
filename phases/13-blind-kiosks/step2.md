# Step 2: baseline-b

## Read first
- Everything listed in step 1 of this phase (`phases/13-blind-kiosks/step1.md`), and its summary in `phases/13-blind-kiosks/index.json`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Exactly step 1's procedure for `bk3-ramen` and `bk4-airport-shop` (baseline, unchanged learner, one run each, results under `spikes/blind-kiosks/results/<kioskId>/baseline/`).
Then write `spikes/blind-kiosks/results/BASELINE.md`: one table with all four kiosks (finished through the gate, minutes, input tokens, item recall, price accuracy, option groups exact, orders correct / safe refusal / unsafe) and a list of the **failure patterns** seen across kiosks (for example quantity options, navigation steps recorded as options, conditional groups, paging, icon-only tabs, native alerts, promotions), each with the kiosks and log lines where it happened. This list is the input for step 3, which must fix patterns, not kiosks.

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
