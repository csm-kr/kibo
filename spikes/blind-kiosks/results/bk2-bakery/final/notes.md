# bk2-bakery, final (learner of 13-blind-kiosks:4)

Learner `spikes/kibo-learn/learner.mjs` as left by 13-blind-kiosks:4 (`spikes/kibo-learn/CHANGES.md`), `PROVIDER=gemini` (`gemini-3.8-flash`), `MAX_INPUT_TOKENS=2000000`, `TRACE_DIR=trace/`, a 30 min wall-clock kill in the spawn wrapper (not reached), 10-14 (05:37 KST), one run, no crash. Written from `learn.log`, the trace (`trace/turn-<n>.json`, `.jpg`), the learned `skill.json`, `grade.json` and one AI-free re-run of the unsafe orders with a per-step log (below); the answer key, brief and app source were not read.

## Outcome
**Finished through the gate**: 86 turns, 114 acts, 11.8 min, 693,862 input tokens (276,042 of them cached, 40%), 52,330 output (`learn-stats.json`). The process exited by itself (exit code 0).

| Call | Turn | Result |
|---|---|---|
| audit #1 | 82 | OK, missing 0, unknown 0, hidden 0, items missing options 3 |
| audit #2 | 83 | OK, items missing options 0 |
| testSkill #1 | 84 | FAIL PASS FAIL |
| testSkill #2 | 85 | PASS PASS PASS |
| finish | 86 | accepted (finish audit OK) |

Grade (`grade.json`, the grader of 13-blind-kiosks:4):
- **Catalog:** items 40/40 (precision 1), price 34/40 (all six sandwiches wrong), category 40/40, sold out 40/40.
- **Options:** items exact 22/27 (openable 22/26); groups found 68/71, rules correct 68; quantity groups recognized 7/7 (the extra-shot stepper, `type: "quantity"` with `select`); conditional groups found 16/19 (ice amount `appliesWhen: "온도 선택=ICED"`).
- **Orders:** correct 5 (h2, h3, h4, h6, h7; 760–910 ms), safe refusal 0, **unsafe 5** (h1, h5, h8, h9, h10), not learned 0. Cart lines read in 0 of 10, so the 5 correct orders are judged by the total only (I-183).

## Baseline → final
| | Baseline (`../baseline/grade.json`) | Final |
|---|---|---|
| Finished | no: input-token cap at turn 77 (2,007,149 input, 10.3 min) | yes, 86 turns, 11.8 min, 693,862 input (40% cached) |
| Items / price | 0/40 (no skill) | 40/40, 34/40 |
| Quantity / conditional groups | 0/7, 0/19 | 7/7, 16/19 |
| Orders correct / safe refusal / unsafe / not learned | 0 / 0 / 0 / 10 | **5 / 0 / 5** / 0 |

The baseline had no skill; its re-grade with this step's grader (`../baseline/regrade-step4/grade.json`) is the same.

## Why the 5 orders are unsafe (I-193)
- Every unsafe order plans 15–20 steps; every correct one 10–13 (`orderPlan` in `spikes/kibo-learn/plan.mjs`). In a re-run of h1, h5 and h10 with a per-step log (same skill and runner, 10-14), the kiosk's own **"계속 주문하시겠어요?"** timeout modal ("30초 후 처음 화면으로 돌아갑니다", buttons `처음으로` and `계속 주문하기`) was already on screen before step 13, about 0.6 s into the order, and the step-13 click under it timed out after 3 s, with part of the order already in the kiosk's cart. What makes the modal appear at that point is unverified (the app source was not read).
- The skill has no step that answers the modal, and could not have one: its only way back, `계속 주문하기`, contains `주문하기`, one of the driver's payment and checkout words. At turn 13 the learner met the modal (a click timed out, `trace/turn-13.jpg`), at turn 14 it tried `계속 주문하기` and the driver refused it ("is a payment or checkout control … list it in forbiddenLabels"); the model then listed it in `forbiddenLabels`. Three more click timeouts (turns 49, 58, 77) are probably the same modal (unverified).
- The learner was not changed in this step (the step forbids it).

## What it did well
- Every item, category and sold-out mark, which the baseline never reached before the cap.
- The extra-shot stepper as a quantity group (`select`: `+` `within` `에스프레소 샷`), the ice amount as a conditional group, syrup as `multi`, dine choice and a `directAdd` recipe for items that go straight into the cart.
- An audit before the first test, as the new prompt asks; 693,862 input tokens, about a third of the baseline's capped 2,007,149.

## Where it failed
- **Unsafe 5:** the timeout modal above.
- Sandwich prices: all six wrong (the grade shows only that they differ; the reason is unverified).
- Temperature-dependent prices put on the wrong side for three drinks (`고구마라떼` ICED +500 in the skill, `유자차` and `자몽차` ICED +0); `딸기라떼` has none of its groups; `에스프레소` gets an extra `HOT ONLY` option.
