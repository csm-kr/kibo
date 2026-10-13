# bk3-ramen, final (learner of 13-blind-kiosks:4)

Learner `spikes/kibo-learn/learner.mjs` as left by 13-blind-kiosks:4 (`spikes/kibo-learn/CHANGES.md`), `PROVIDER=gemini` (`gemini-3.8-flash`), `MAX_INPUT_TOKENS=2000000`, `TRACE_DIR=trace/`, `KIOSK_ID=bk3-ramen` (trace label only), a 30 min wall-clock kill in the spawn wrapper (not reached), 10-14 (about 06:00 KST, in parallel with `bk4-airport-shop`), one run, no crash. Written from `learn.log`, the trace (`trace/turn-<n>.json`, `.jpg`), the learned `skill.json` and `grade.json` (the answer key, brief and app source were not read).

## Outcome
**Finished through the gate**: 46 turns, 66 acts, 8.0 min, 437,774 input tokens (227,679 of them cached, 52%), 19,472 output (`learn-stats.json`). The process exited by itself (exit code 0); stderr was empty.

| Call | Turn | Result |
|---|---|---|
| audit #1 | 43 | OK, missing 0, unknown 0, hidden 0, items missing options 0 |
| testSkill #1 | 44 | PASS PASS PASS |
| audit #2 | 45 | OK |
| finish | 46 | accepted (finish audit OK) |

Grade (`grade.json`, the grader of 13-blind-kiosks:4):
- **Catalog:** items 25/25 (precision 1), price 25/25, category 25/25, sold out 25/25.
- **Options:** items exact 13/14 (openable 13/13); groups found 26/28, labels and rules correct 26; quantity groups recognized 7/8; conditional groups 0 (none in the key).
- **Orders:** correct 10 (h1–h10; 360–1,036 ms), safe refusal 0, **unsafe 0**, not learned 0. Cart lines read in 0 of 10, so all 10 are judged by the kiosk total only (I-183). The grade lists 21 chosen options across the orders that the total cannot confirm (0원 choices: noodle firmness, the set's ramen, side and drink at no extra cost, some toppings in a set); a wrong pick there would still count as correct.

## Baseline → final
| | Baseline (`../baseline/grade.json`) | Final |
|---|---|---|
| Finished | yes, 95 turns, 20.6 min, 1,582,965 input | yes, 46 turns, 8.0 min, 437,774 input (52% cached) |
| Items / price | 25/25, 25/25 | 25/25, 25/25 |
| Options items exact | 4/14 (openable 4/13) | 13/14 (openable 13/13) |
| Groups found / quantity groups | 11/28, 0/8 | 26/28, 7/8 |
| Orders correct / safe refusal / unsafe | 2 / 6 / 2 | **10 / 0 / 0** |

The baseline skill was re-graded with this step's grader (`../baseline/regrade-step4/grade.json`, because 13-blind-kiosks:4 moved the grader's plan expansion to `plan.mjs`): the same numbers and outcomes.

## What it did well
- **Topping steppers** (the baseline's 13 failed tries at turns 9–21): every ramen except one has `토핑 추가` as a `quantity` group (max 3), and the orders with toppings replay.
- **Set menus:** walked `라멘 기본 세트` (turns 23–25) and `라멘 든든 세트` (turns 27–30) and recorded both as option groups (ramen, firmness, side, drink) with the wizard's `다음` as each group's `after` step, so set orders replay instead of being refused.
- **Cart quantity:** `qty > 1` taps `수량 더하기` `within` the item's own cart line, so the baseline's ambiguous match (its 2 unsafe orders) is gone.
- **No checkout or payment taps** during exploration (the baseline tapped `주문하기` and `결제하기` at turns 49–50); `주문하기` is in `forbiddenLabels`.
- One recipe (`addToCart`) with `chooseOptions` and `clickIfVisible 담기` covers ramen, rice bowls, sets, and sides and drinks that go straight into the cart.
- Audit before the first test, one 3-order test, about a quarter of the baseline's input tokens and less than half its time.

## Where it failed
- **츠케멘** has neither its firmness nor its topping group (the only item not exact); no holdout order used it.
- Native `alert()` text is not in the log, so whether the kiosk raised any during the run is unverified.
- The skill's `startOrder` taps the brand title `면구름 라멘` with `clickIfVisible` to leave the attract screen; it worked here, but it is a guess that any tap starts the order (its own note says so).
