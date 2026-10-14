# bk2-bakery, round 3 (informed)

**Label: round 3, informed.** The learner was changed after seeing this kiosk's failures (I-193, I-194), so this run never counts as an unseen-kiosk result (`../../../ROUND3.md`). It is reported beside `../final/` and `../final-after-fix/`, never instead of them.

Learner `spikes/kibo-learn/` at `ea28477` (`learner.dirty: false` in `learn-stats.json`), `PROVIDER=gemini`, `gemini-3.8-flash`, `MAX_INPUT_TOKENS=2000000`, `TRACE_DIR=trace/`, `KIOSK_ID=bk2-bakery`, a 30 min wall-clock kill in a spawn wrapper outside the repo (not reached; `wrapper.json`), 10-14 11:15 KST, in parallel with the Gureum dev rerun, one run, no crash, `stderr.log` empty. Graded with `spikes/blind-kiosks/grade/` at the same commit (`grade-v2.json`; grader v2 rules, kiosk total read on the order review the skill declares, `ROUND3.md`). Written from `learn.log`, `learn-stats.json`, `skill.json`, `grade-v2.json` and the trace; the app source, brief and answer key were not read.

## Outcome
**Finished through the round-3 gate**: 97 turns, 129 acts, 15.6 min, 1,063,159 input tokens (569,865 cached, 54%), 62,486 output; $0.65 at the `evidence/cost-per-order.json` Gemini API prices (Vertex price unverified).

| Call | Turn | Result (`learn.log`) |
|---|---|---|
| audit #1 | 90 | OK, items missing options 1 |
| testSkill #1–#3 | 91, 92, 93 | FAIL FAIL FAIL, 8 option groups unused: the review's total was unreadable (its `totalPattern` did not match), and once `no "+" near "에스프레소 샷"` |
| testSkill #4 | 95 | PASS PASS PASS, every option group used |
| audit #2, finish | 96, 97 | OK, accepted |

The skill declares the kiosk's timeout modal as an interrupt (`"계속 주문하시겠어요?"` → `계속 주문하기`), the order review (`openReview 주문하기`, total `총 결제금액…`, back with `메뉴 추가하기`), and `forbiddenLabels: ["결제하기"]`. `openReview` was used while exploring at turns 52, 60 and 94; no payment control was tapped.

## Grade (`grade-v2.json`)
| | `../final/` (phase 13) | `../final-after-fix/` (phase 13, informed) | round 3 (informed) |
|---|---|---|---|
| Orders correct / safe refusal / unsafe | 5 / 0 / 5 | 6 / 0 / 4 | **10 / 0 / 0** |
| Skill total wrong (of orders with a kiosk total) | 2 of 5 | 1 of 6 | **0 of 10** |
| Items, prices | 40/40, 34/40 | 40/40, 37/40 | 40/40, 40/40 |
| Options items exact; quantity; conditional | 22/27; 7/7; 16/19 | 25/27; 7/7; 15/19 | 26/27; 7/7; 16/19 |

The kiosk total was read on the review in all 10 orders and equals the menu cart's total in all 10 (`cartOnlyOutcome` is also 10 / 0 / 0). The runner answered the modal in h1, h5, h8, h9 and h10 (2 answers each over the grader's two replays), exactly the five orders that were unsafe in `../final/`. One run, so the catalog differences may be run-to-run variation.
