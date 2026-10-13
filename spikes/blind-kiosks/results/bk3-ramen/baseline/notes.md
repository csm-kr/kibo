# bk3-ramen, baseline (phase-12 learner + I-185 crash fix + I-187 exit fix only)

Learner `spikes/kibo-learn/learner.mjs` with only the I-185 and I-187 fixes (`spikes/kibo-learn/CHANGES.md`; neither changes how it explores), `PROVIDER=gemini` (`gemini-3.8-flash`), `MAX_INPUT_TOKENS=2000000`, a 30 min wall-clock kill in the spawn wrapper (not reached), 10-13, one run. Written from the log, the learned `skill.json` and `grade.json` only (the answer key, brief and app source were not read).

## Outcome
**Finished through the gate**: 95 turns, 80 acts, 20.6 min, 1,582,965 input / 20,044 output tokens (`learn-stats.json`). The process exited by itself (exit code 0, 20.7 min including browser start). The "Stop exploring" nudge fired at turn 80 (80 turns without a test; the rule in `learner.mjs`), without a crash; the model called `records` at turn 82 and its first `testSkill` at turn 83.

| Call | Turn | Result |
|---|---|---|
| testSkill #1 | 83 | FAIL FAIL FAIL |
| testSkill #2–#7 | 84–91 | PASS, FAIL, FAIL, PASS, PASS, PASS (one order each) |
| audit #1 | 92 | OK, missing 0, unknown 0, hidden 0 |
| testSkill #8 | 93 | PASS PASS PASS |
| audit #2 | 94 | OK |
| finish | 95 | accepted |

Grade (`grade.json`):
- **Catalog:** items 25/25 (precision 1), price 25/25, category 25/25, sold out 25/25.
- **Options:** items exact 4/14 (openable 4/13); groups found 11/28, rules correct 11; quantity groups recognized 0/8; conditional groups 0 (none in the key).
- **Orders:** correct 2 (h1 309 ms, h5 402 ms), safe refusal 6 (h2, h3, h6, h7, h8, h10), **unsafe 2** (h4, h9), not learned 0. Cart lines read in 0 of 10, so the 2 correct orders are judged by the total only (I-183).

## What it did well
- Every item, price, category and sold-out mark on the first pass through five filter chips.
- Noodle firmness (`꼬들/보통/부드럽게`) on seven ramen and the optional rice size on four rice bowls, with the right price delta.
- Noticed that sides and drinks go straight into the cart on a tap, and wrote `clickIfVisible 담기` so one recipe covers both kinds.

## Where it failed
- **Topping quantity steppers (turns 9–21):** it tried to add `차슈` 13 ways (role button, text, `+` as label, role and text, exact text, the price text, role `spinbutton`, even role `foo`) and never found a target; no ramen has its topping group in the skill (0/8 quantity groups). Every holdout order with a topping is a safe refusal.
- **Set menus as a 3-step modal (turns 40–48, 74–79):** it walked `라멘 기본 세트` (ramen, firmness, `다음`, side, `다음`, drink, `담기`) and `라멘 든든 세트`, but recorded both sets with no option groups and no recipe of their own, so set orders are refused.
- **Unsafe (h4, h9):** `qty > 1` is done after `담기` by tapping `수량 더하기` in the cart list. With two or more lines in the cart that label matches 2–3 buttons (strict mode), so the replay stops after clicks were made. Same pattern as bk1.
- **Exploration went into checkout and payment:** turn 49 tapped `주문하기` and turn 50 `결제하기`. Harmless here (the kiosk stops at the payment-method screen), but on a real kiosk the learner would have approached a payment step; the skill has no `forbiddenLabels`, and `주문하기` is listed in `uiLabels`.
- Native `alert()` text is not printed in the log, so whether the kiosk raised any during the run is unverified.
- Cost: about 16,700 input tokens per turn; 20.6 min is the slowest of the baselines so far.
