# Step 2: crash-fix

## Read first
- `phases/13-blind-kiosks/step1.md` and its summary in `phases/13-blind-kiosks/index.json` (both baseline runs and their reruns crashed); `spikes/blind-kiosks/PROTOCOL.md`; `spikes/kibo-learn/learner.mjs`, `driver.mjs`, `runner.mjs`; `spikes/blind-kiosks/results/bk{1-cinema,2-bakery}/baseline/` (logs, notes); issue I-185 in `docs/ISSUE.md`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
Step 1's baselines measured a crash, not learning: every run died with Vertex AI HTTP 400 "Requests ending with a model turn are not supported." right after the learner's "Stop exploring" nudge (turn 80 or 100), so all four kiosks would score 0 for a reason unrelated to how well KIBO Learn explores. Earlier runs never reached turn 80 (Doughhouse run 3: 63 turns), which is why it was not seen. The orchestrator decided (10-13): fix only this crash, then re-run the baselines, so the baseline measures the learner's ability; the learning changes stay in step 4.

## Task
1. **Reproduce without AI:** a `node --test` test (under `spikes/kibo-learn/` next to the existing learner tests) that drives the learner's request building with a fake `fetch` past the nudge turn and asserts the request body never ends with a `model` turn (and that the nudge text is inside the last `user` turn together with the function responses, as the API expects). It must fail on the current code.
2. **Fix the crash only:** the smallest change in `learner.mjs` that makes the test pass, plus one retry with a short wait on HTTP 429/500/503 from Vertex (not on 400). Do not change prompts, tools, the finish gate, the audit, limits or anything else that affects how the learner explores (fairness: step 4 does that).
3. **Re-run the baselines for `bk1-cinema` and `bk2-bakery`** exactly as step 1 describes (`PROVIDER=gemini`, default model, `MAX_INPUT_TOKENS=2000000`, cwd `results/<kioskId>/baseline/`), after moving step 1's crashed runs to `results/<kioskId>/baseline-crashed/` (keep them; they are evidence). One run each; one rerun only if it crashes for a **different** reason. Grade, and write `notes.md` as in step 1.
4. Update `spikes/blind-kiosks/PROTOCOL.md` (baseline = the learner at the end of phase 12 plus the I-185 crash fix only; the crashed first runs kept in `baseline-crashed/`), `spikes/kibo-learn/CHANGES.md` (the fix), and I-185 (fixed, with the test name).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```
plus the new learner test (name the command in the summary).

## Verify
1. Both kiosks have `baseline/` (new) and `baseline-crashed/` (old) with logs, stats, grade and notes; the summary lists each kiosk's catalog recall and orders correct / safe refusal / unsafe / not learned, turns, minutes and input tokens.
2. Search the new files for `ya29.`, `AIza` and `sk-`; none may appear. The four kiosks' `answer-key.json`, `BRIEF.md` and `app/` source were not read.
3. Update this step in `phases/13-blind-kiosks/index.json` (completed + summary / error / blocked).

## Do not
- Do not change how the learner explores (only the crash and the retry).
- Do not rerun to get a better number.
- Break existing tests.
