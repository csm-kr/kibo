# Step 4: learn-rerun

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: KIBO_LEARN ("Learning loop", "Coverage audit", "Results so far" and the note that the Gemini runs predate the finish gate and the audit), TESTING "Evidence ledger", RULE R-001, ISSUE I-022.
- `spikes/kibo-learn/learner.mjs`, `audit.mjs`, `runner.mjs`, `holdout.mjs`, `test_audit.mjs`, `driver.mjs`, `package.json`, `results/` (existing runs).

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`. The learner gets a Vertex AI access token by running `gcloud auth print-access-token` itself inside Node; that is allowed. It uses Chrome at `/Applications/Google Chrome.app` (installed).

## Task
Re-measure KIBO Learn with Gemini under today's rules (finish gate: ≥ 3 self-tests + coverage audit), so the deck and video can quote Gemini numbers that include the gate.

1. `cd spikes/kibo-learn` is not available as a shell command: run scripts with `node spikes/kibo-learn/<script>` and check how each script resolves paths (the driver resolves `kiosk/index.html` from the working directory; set `KIOSK_URL` to the file URL of `spikes/kibo-learn/kiosk/index.html` if needed). Install the spike's dependency with `npm --prefix spikes/kibo-learn install` if `playwright-core` is missing.
2. **Audit regression (I-022):** run `node spikes/kibo-learn/test_audit.mjs <pizzaUrl> <blindUrl>` as TESTING describes and save the output to `spikes/kibo-learn/results/test_audit.<date>.log`. Mark I-022 fixed with the path.
3. **Gemini re-run on Doughhouse:** run the learner with `PROVIDER=gemini` (default model `gemini-3.8-flash`) and the default token cap; save the log, stats and skill under `spikes/kibo-learn/results/run3/`. Then run the holdout orders (`holdout.mjs`) against the new skill and save the log there too. If the run fails, keep the logs and report honestly; do not retry more than twice (cost).
4. Update `docs/KIBO_LEARN.md` "Results so far" and the `docs/TESTING.md` ledger with the new rows (minutes, turns, input tokens, finish gate passed or not, holdout result), each pointing to its file. Keep the old rows; say which rows include the gate.
5. Compare the new skill with the reviewed `skills/doughhouse.json`: list differences in catalog or recipes in the summary; do not replace the reviewed skill automatically.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```
(The learner run itself is a measurement, not a pass/fail criterion; its outcome must be recorded either way.)

## Verify
1. Run the AC commands; the result files exist and are referenced from the docs.
2. Check no API keys or tokens are written into logs or committed files (search the new files for `ya29.` and `AIza`).
3. Update this step in `phases/6-learn/index.json` (completed + summary with the measured numbers / error / blocked: if gcloud credentials are missing, blocked with the reason).

## Do not
- Do not use OpenAI for this run (published numbers come from Gemini; ADR-008).
- Do not edit numbers by hand; copy them from the saved files.
- Break existing tests.
