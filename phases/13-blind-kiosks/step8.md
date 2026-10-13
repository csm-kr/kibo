# Step 8: final-fresh

## Read first
- `spikes/blind-kiosks/PROTOCOL.md`, `phases/13-blind-kiosks/step5.md` (the final run procedure) and the summaries of steps 4–6 in `phases/13-blind-kiosks/index.json`; `spikes/kibo-learn/CHANGES.md`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
An independent judge review (10-13) pointed out that the learner improvements in step 4 were driven by failure patterns seen on the four test kiosks (`BASELINE.md`), so their final runs are not a clean "never seen" result. To answer that, the orchestrator had two **more** kiosks built by independent agents from short briefs, kept outside the repo while the learner was being changed, and copied them into `spikes/blind-kiosks/bk5-restarea/` (highway rest-area food court) and `spikes/blind-kiosks/bk6-themepark/` (theme park ticket and snack kiosk) only after step 4 was committed. Nobody working on the learner has seen them. They are the **fresh test set**.

## Task
1. Record in `PROTOCOL.md` a "Fresh test set" section: the two kiosks, who built them (independent agents, briefs in each `BRIEF.md`), when they entered the repo (the commit that added them, after the step 4 learner commit), and the rule that the learner is not changed after seeing them.
2. Run the final procedure (step 5's: improved learner, `PROVIDER=gemini`, default model, 2M cap, one run per kiosk, a 30-min kill in the spawn wrapper, results under `spikes/blind-kiosks/results/<kioskId>/final/` with `TRACE_DIR=.../final/trace`) on `bk5-restarea` and `bk6-themepark`, **in parallel**. No baseline run is needed for these (they measure the final learner on unseen kiosks); grade both.
3. Write `notes.md` per kiosk like the other finals.

**Time limit:** a step session is killed after 60 min and retried. If this is a retry after a timeout: do not start a new run for a kiosk whose `final/learn.log` already exists; if its `learner.mjs` is still running (`ps`), wait for it (kill only after 30 min), then grade.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. Both fresh kiosks have `final/` with logs, stats, grade, notes and the trace.
2. No learner, driver, runner, audit or grader file changed in this step (`git diff --stat` shows only results, PROTOCOL.md and this phase's files).
3. Update this step in `phases/13-blind-kiosks/index.json` (completed + summary with each kiosk's item recall and orders correct / safe refusal / unsafe / not learned, minutes, tokens / error / blocked).

## Do not
- Do not change the learner, driver, runner, audit or grader in this step, because these kiosks exist to measure the learner as it was before anyone saw them.
- Do not rerun to get a better number.
