# Step 1: baseline-a

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. KIBO_LEARN; RULE R-001.
- `spikes/blind-kiosks/PROTOCOL.md` (rules: one run per kiosk, token cap 2M input, no reruns except one rerun after a crash), `spikes/blind-kiosks/grade/README.md` and `grade.mjs` (step 0).
- How earlier runs were launched: `phases/6-learn/index.json` step "learn-rerun" summary (node `-e` wrappers that set the working directory and `KIOSK_URL`, because env prefixes and redirects are blocked in this harness).

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Baseline learning runs with the **current, unchanged** learner on `bk1-cinema` and `bk2-bakery`.
For each kiosk, in this order:
1. Run `spikes/kibo-learn/learner.mjs` with `PROVIDER=gemini` (default model), `MAX_INPUT_TOKENS=2000000`, the working directory `spikes/blind-kiosks/results/<kioskId>/baseline/` and `KIOSK_URL` = the file URL of `spikes/blind-kiosks/<kioskId>/app/index.html`. Save stdout to `learn.log` there. The learner never receives the answer key or the brief.
2. Grade: `npm run grade:blind -- <kioskId> spikes/blind-kiosks/results/<kioskId>/baseline/skill.json` (if no skill was produced, grade records "no skill" and orders all count as not learned).
3. Write a short `notes.md` there: what the learner did well and where it failed (from the log), without changing anything.
Commit the result folders (logs can be large: if a log exceeds 5 MB, keep the first and last 2,000 lines plus a note).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```
(The learning runs are measurements; their outcomes are recorded whatever they are.)

## Verify
1. Both kiosks have `learn.log`, `learn-stats.json` (if the learner wrote one), `grade.json` and `notes.md` under `results/<kioskId>/baseline/`.
2. Search the new files for `ya29.`, `AIza` and `sk-` and make sure none appear.
3. Update this step in `phases/13-blind-kiosks/index.json` (completed + summary with each kiosk's catalog recall and orders correct/refused/unsafe / error / blocked).

## Do not
- Do not change the learner, driver, runner or audit in this step.
- Do not rerun to get a better number.
- Do not read the kiosks' `answer-key.json` or `BRIEF.md` while writing `notes.md` beyond what the grade output shows.
