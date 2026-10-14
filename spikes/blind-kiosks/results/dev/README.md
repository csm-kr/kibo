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

## Round 3 dev-set runs (10-14, `spikes/blind-kiosks/ROUND3.md`)
`gemini-3.8-flash` on Vertex AI, 2M input-token cap, 30 min wall-clock kill (not reached in any run), `TRACE_DIR` set. Cost at the Gemini API prices in `evidence/cost-per-order.json` (Vertex price unverified).

| Run | Learner (`learn-stats.json` `learner`) | Finished | Turns | Minutes | Input (cached), output | Cost | Result |
|---|---|---|---|---|---|---|---|
| `gemini-doughhouse-round3` | `29aa175`, clean | yes | 35 | 5.2 | 347,025 (138,526), 16,993 | $0.23 | `holdout.log`: 4/4 and the rule violation detected (1.6–2.2 s per order). The skill declares the order review (`openReview 주문하기`, which leads to the card screen) and the side-dish popup as an interrupt (`아니요, 괜찮아요`); every option group (toppings too) was used by a passing self-test |
| `gemini-gureum-round3` | `29aa175`, **dirty**: my uncommitted `spikes/kibo-learn/CHANGES.md` edit (docs only; the code was the commit's) | **no**: 2M cap at turn 95 | 95 | 23.1 | 2,088,236 (1,092,069), 110,159 | $1.24 | no skill, 5 of 5 not learned (`grade-v2.json`). First test at turn 84; four tests, still 12 option groups unused and orders failing. Each audit and test re-sent the ~13k-token skill, and those copies stayed in the context (input per turn 16k at turn 82, 140k at turn 90): the reason for the second round-3 commit |
| `gemini-gureum-round3-run2` | `ea28477` (frozen), clean | **no**: 2M cap at turn 111 | 111 | 17.4 | 2,009,976 (1,418,391), 62,945 | $0.79 | no skill (`last-skill.json` kept, not graded as learned). A first test at turn 92 passed 3/3 on a partial catalog; the audit then listed 35 missing items, and the full skill's next test failed 3/3 with option labels not found on the item sheet (`카라멜 시럽`, `바닐라 시럽`, `많이 올려주세요`; cause not traced) and 23 option groups unused. Output tokens fell from 110k to 63k with the reuse change, but the run still ended at the cap |

Plainly: on the 40-item dev kiosk, the round-3 learner did not finish in either run; the stricter gate (every option group used, about 22 groups on this kiosk) and the long exploration before the first test left no room for fixes under the 2M cap. The earlier Gemini runs on this kiosk (`spikes/blind-kiosk/results/v3run*`) finished 2 of 3 without any finish gate.
