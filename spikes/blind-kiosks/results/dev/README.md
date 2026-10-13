# Dev-set runs, 13-blind-kiosks:4

Development only, never published (`PROTOCOL.md`: the developer works on the dev set, Doughhouse and Gureum Darak Coffee). One run each on 10-13, so run-to-run spread is unknown. Learner changes: `spikes/kibo-learn/CHANGES.md`.

## Gemini, token cost of the learner (the only two Gemini runs of this step)
`gemini-3.8-flash`, Doughhouse, input-token cap 1M.

| Run | Learner | Finished | Turns | Minutes | Input tokens | Cached | Output | Holdout (`holdout.mjs`) |
|---|---|---|---|---|---|---|---|---|
| `gemini-doughhouse-before` | end of step 3, plus the cached-token count | yes | 59 | 9.2 | 416,373 | 191,500 (46%) | 12,319 | 4/4, rule violation detected |
| `gemini-doughhouse-after` | step 4 without the `missingOptions` audit; with a trace (`trace/`) | yes | 38 | 4.0 | 352,822 | 196,701 (56%) | 20,279 | 4/4, rule violation detected |

## OpenAI, regression check (`PROVIDER=openai`, default model `gpt-6-luna`, cap 2M)
Compared with the earlier OpenAI dev runs (`spikes/kibo-learn/results/openai/`, `spikes/blind-kiosk/results/blind-sol2/`).

| Run | Model | Finished | Turns | Minutes | Input tokens (cached) | Result |
|---|---|---|---|---|---|---|
| `openai-doughhouse` (step 4 learner) | gpt-6-luna | yes | 49 | 4.2 | 295,532 (239,186) | holdout 1/4 passed; 2 orders stop mid-replay because the recipe clicks every option as `role: radio` while toppings are checkboxes, 1 times out (as in the earlier skill); the violation order also stops mid-replay, so "DETECTED" in `holdout.log` is not a detection |
| `openai-doughhouse-interim` (step 4 learner before the `missingOptions` audit) | gpt-6-luna | yes | 46 | 4.8 | 283,094 (220,942) | holdout 1/4; the skill has no topping group, so 3 orders are refused before any click |
| earlier `skill.gpt-luna2.json` (phase 12 learner), replayed with today's runner (`earlier-luna2-holdout.log`) | gpt-6-luna | yes | 36 | 2.0 | 139,269 (72,737) | holdout 2/4 passed, rule violation detected; 1 refused (no 제로콜라 in the catalog), 1 times out |
| earlier `holdout.gpt-sol.log` | gpt-6.1-sol | yes | 44 | 3.1 | 180,780 (62,671) | holdout 4/4, rule violation detected |
| `openai-gureum` (step 4 learner) | gpt-6-luna | **no**: 2M cap at turn 130 | 130 | 10.0 | 2,026,509 (1,560,117) | no skill: 0 of 5 orders (`grade.json`); it tested from turn 82 and called its first audit only at turn 94, which listed 37 items missing |
| `openai-gureum-stopped` | gpt-6-luna | stopped by hand at turn 23 to restart with the step 4 learner | | | | not a result |
| earlier `blind-sol2`, graded today with the blind-kiosk grader (`earlier-blind-sol2/grade.json`) | gpt-6.1-sol | yes, at 2.93M tokens (above today's 2M cap) | 159 | 16.1 | 2,932,197 (1,030,197) | items 40/40, options exact 3/35, orders 2 correct, 2 safe refusal, 1 unsafe of 5 |

**Plainly: on the dev set the step 4 learner with `gpt-6-luna` did worse than the earlier OpenAI runs.** Doughhouse holdout 1/4 against 2/4 for the earlier luna skill (and 4/4 for gpt-6.1-sol); Gureum ended with no skill at the 2M cap, where no earlier luna run exists and the earlier finished run used a stronger model and 2.93M tokens. With one run each and a model the KIBO_LEARN results already call "failed or shallow", this does not separate the learner from the model. The same learner with Gemini finished Doughhouse in fewer turns and tokens than before, with the same 4/4 holdout. What the luna runs show is a gap the gate does not close: the self-tests may leave whole option groups unexercised, so a recipe that cannot reach them (checkboxes clicked as radios) still passes the gate.
