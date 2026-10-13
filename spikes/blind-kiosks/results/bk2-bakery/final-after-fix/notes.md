# bk2-bakery, final after the I-193 fix (informed by bk2)

**Label: after the I-193 fix, informed by bk2.** This run exists because the `final/` run of this kiosk showed the bug the fix addresses, so it is not a blind measurement. It is reported beside `../final/`, never instead of it (`spikes/blind-kiosks/PROTOCOL.md` "I-193 fix").

Learner `spikes/kibo-learn/learner.mjs` of 13-blind-kiosks:7: the step-4 learner plus the whole-label payment rule (`isForbidden` in `spikes/kibo-learn/plan.mjs`, `spikes/kibo-learn/CHANGES.md`). `PROVIDER=gemini` (`gemini-3.8-flash`), `MAX_INPUT_TOKENS=2000000`, `TRACE_DIR=trace/`, `KIOSK_ID=bk2-bakery` (trace label only), a 30 min wall-clock kill in a node spawn wrapper outside the repo (not reached), 10-14, one run, no crash, stderr empty (`learn.stderr.log`). Written from `learn.log`, `learn-stats.json`, `skill.json`, `grade.json`, the trace and one AI-free re-run of the unsafe orders with a per-step log (below); the answer key, brief and app source were not read.

## Outcome
**Finished through the gate**: 108 turns, 155 acts, 16.8 min, 1,867,350 input tokens (1,320,614 cached, 71%), 87,144 output (`learn-stats.json`). The process exited by itself (exit code 0).

| Call | Turn | Result |
|---|---|---|
| audit #1, #2 | 83, 84 | OK, missing 0, unknown 0, hidden 0, items missing options 1 |
| testSkill #1 | 85 | FAIL PASS FAIL |
| audit #3 | 104 | OK, items missing options 0 |
| testSkill #2 | 105 | FAIL PASS FAIL |
| audit #4 | 106 | OK |
| testSkill #3 | 107 | PASS PASS PASS |
| finish | 108 | accepted (finish audit OK) |

The driver no longer refuses the timeout modal's button: the learner tapped `계속 주문하기` at turns 12 and 58, and the skill answers it with `clickIfVisible` at the start of `startOrder` and of each line recipe. `forbiddenLabels` is `["주문하기"]` (the final run had `계속 주문하기` there as well). No checkout or payment tap while learning.

## Grade (`grade.json`, the grader with the same rule, 13-blind-kiosks:7)
| | `../final/` (step-4 learner) | final after the I-193 fix |
|---|---|---|
| Finished | yes, 86 turns, 11.8 min, 693,862 input (40% cached) | yes, 108 turns, 16.8 min, 1,867,350 input (71% cached) |
| Items / price / category / sold out | 40/40, 34/40 | 40/40, 37/40 |
| Options items exact (openable) | 22/27 (22/26) | 25/27 (26/26) |
| Groups found / rules correct | 68/71, 68 | 67/71, 67 |
| Quantity / conditional groups | 7/7, 16/19 | 7/7, 15/19 |
| Orders correct / safe refusal / unsafe / not learned | 5 / 0 / 5 / 0 | **6 / 0 / 4 / 0** |
| Unsafe orders | h1, h5, h8, h9, h10 | h1, h5, h9, h10 |

Cart lines read in 0 of 10 on both, so every correct order is judged by the kiosk total only (I-183). One run each, so the catalog differences may be run-to-run variation, not the fix (unverified).

## Why 4 orders are still unsafe (I-194)
Re-run of h1, h5, h9 and h10 with the same skill and runner and a per-step log (10-14): each order stopped on a click that timed out after 3 s (h1 step 17 of 18, h5 18 of 19, h9 18 of 22, h10 17 of 23), and each time the "계속 주문하시겠어요?" modal was on screen. It came up **in the middle of a line** (after an option or quantity step, e.g. h10 after `ICED > 보통 > 일반 우유` before `담기`), about 0.6 s after the previous step, while the skill answers it only at the start of a line. So the I-193 part is fixed (the button can be tapped, and is tapped where the skill asks), but this skill cannot answer a modal that appears between two steps of one line. What triggers the modal at that point is unverified (the app source was not read). Not changed in this step: answering it before every step is a runner change beyond the I-193 rule.
