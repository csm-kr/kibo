# Spikes: KIBO Learn development experiments

These folders are development experiments, not product code. They hold the first version of KIBO Learn (`docs/KIBO_LEARN.md`): a learner that explores a kiosk's web UI and writes a skill, a coverage audit, an AI-free replay runner, and the test kiosks it was tried on.

- `kibo-learn/`: learner, driver, audit and runner, with a pizza kiosk we built (Doughhouse).
- `blind-kiosk/`: a cafe kiosk (Gureum Darak Coffee) built by a separate agent whose structure we did not know, its answer key and graders.

## Which runs count
The learner can run on Gemini (default, through Vertex AI) or on OpenAI (`PROVIDER=openai`). **OpenAI runs were development aids only**, used to iterate cheaply on the learner. They are kept for transparency and are never quoted as results. The product itself uses Gemini only.

OpenAI runs (development only): `kibo-learn/results/openai/`, `blind-kiosk/results/blind-sol/`, `blind-kiosk/results/blind-sol2/`.

Published numbers come from Gemini runs (`docs/TESTING.md`, evidence ledger):

| Claim | Value | Evidence |
|---|---|---|
| Learn the pizza kiosk (Gemini 3.8 Flash) | 5.5 min, 72 turns, 635,725 input tokens | `kibo-learn/results/stats.run2.json`, `learn.run2.log` |
| Replay unseen pizza orders | 4/4 + 1 rule violation detected | `kibo-learn/results/holdout.run2.log` |
| Blind cafe learning success | 2/3 (10.3 min, 15.1 min) | `blind-kiosk/results/v3run{1,2,3}/learn-stats.json` |
| Blind cafe catalog accuracy | items 40/40; options 22/29 and 21/29 | `blind-kiosk/results/v3run{1,2}/grade.txt`, `grade_fair.txt` |
| Blind cafe example orders | 2/5 and 3/5 pass; rest refused before execution | `blind-kiosk/results/holdout.log` |

These Gemini runs were made before the learner required ≥ 3 passing self-tests and the coverage audit to finish (`docs/KIBO_LEARN.md`); a Gemini re-run with both is planned.
