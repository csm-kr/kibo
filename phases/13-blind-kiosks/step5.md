# Step 5: final-a

## Read first
- `phases/13-blind-kiosks/step1.md` (the run procedure), `spikes/blind-kiosks/PROTOCOL.md`, `spikes/kibo-learn/CHANGES.md` (step 4).

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Step 1's procedure with the **improved** learner on `bk1-cinema` and `bk2-bakery`, results under `spikes/blind-kiosks/results/<kioskId>/final/` with `TRACE_DIR=spikes/blind-kiosks/results/<kioskId>/final/trace` (step 4's trace) so step 7 can replay the learning (same token cap, one run each, one rerun only after a crash). Grade with the same grader version as the baseline (if the grader changed in step 4, re-grade the baseline skills with the new grader too and keep both grades, labelled).

**Time limit (orchestrator, 10-13):** a step session is killed after 60 min and retried. Start both kiosks' learner runs **in parallel** (separate working directories, each with a 30-min kill in the spawn wrapper), then grade. **If this is a retry after a timeout:** do not start a new run for a kiosk whose `final/learn.log` already exists; if its `learner.mjs` is still running (`ps`), wait for it (kill only after 30 min), then grade and write the notes.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. Both final folders exist with logs, stats, grade and notes.
2. Update this step in `phases/13-blind-kiosks/index.json` (completed + summary with baseline → final per kiosk / error / blocked).

## Do not
- Do not change the learner in this step.
- Do not rerun to get a better number.
