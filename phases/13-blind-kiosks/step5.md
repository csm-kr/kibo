# Step 5: final-b

## Read first
- `phases/13-blind-kiosks/step4.md` and its summary in `phases/13-blind-kiosks/index.json`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Step 4's procedure for `bk3-ramen` and `bk4-airport-shop` (improved learner, one run each, results under `spikes/blind-kiosks/results/<kioskId>/final/` with `TRACE_DIR=spikes/blind-kiosks/results/<kioskId>/final/trace` (step 3's trace) so step 6 can replay the learning).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. Both final folders exist with logs, stats, grade and notes.
2. Update this step in `phases/13-blind-kiosks/index.json` (completed + summary / error / blocked).

## Do not
- Do not change the learner in this step.
- Do not rerun to get a better number.
