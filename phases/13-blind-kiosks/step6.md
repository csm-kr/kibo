# Step 6: final-b

## Read first
- `phases/13-blind-kiosks/step5.md` and its summary in `phases/13-blind-kiosks/index.json`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Step 5's procedure for `bk3-ramen` and `bk4-airport-shop` (improved learner, one run each, results under `spikes/blind-kiosks/results/<kioskId>/final/` with `TRACE_DIR=spikes/blind-kiosks/results/<kioskId>/final/trace` (step 4's trace) so step 7 can replay the learning).

**Time limit (orchestrator, 10-13):** a step session is killed after 60 min and retried. Start both kiosks' learner runs **in parallel** (separate working directories, each with a 30-min kill in the spawn wrapper), then grade. **If this is a retry after a timeout:** do not start a new run for a kiosk whose `final/learn.log` already exists; if its `learner.mjs` is still running (`ps`), wait for it (kill only after 30 min), then grade and write the notes.

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
