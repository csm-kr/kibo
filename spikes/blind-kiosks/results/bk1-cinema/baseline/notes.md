# bk1-cinema, baseline (phase-12 learner + I-185 crash fix only)

Learner `spikes/kibo-learn/learner.mjs` with only the I-185 fix (`spikes/kibo-learn/CHANGES.md`), `PROVIDER=gemini` (`gemini-3.8-flash`), `MAX_INPUT_TOKENS=2000000`, 10-13, one run. Written from the log, the learned `skill.json` and `grade.json` only (the answer key, brief and app source were not read). The first two runs, which crashed at the nudge, are in `../baseline-crashed/`.

## Outcome
**Finished through the gate**: 109 turns, 102 acts, 7.4 min, 1,068,732 input / 22,840 output tokens (`learn-stats.json`). The nudge fired at turn 80 without a crash, and the model wrote its first skill at turn 82.

| testSkill | Result |
|---|---|
| #1 (turn 82) | FAIL FAIL FAIL |
| #2 (turn 83) | PASS (one order, does not count for the gate) |
| #3 (turn 107) | PASS PASS PASS |
| audit #1 (turn 108) | OK, missing 0, unknown 0, hidden 0 |
| finish (turn 109) | accepted |

Grade (`grade.json`):
- **Catalog:** items 32/32 (precision 1), price 32/32, category 32/32, sold out 32/32.
- **Options:** items exact 19/25 (openable 20/22); groups found 30/39, rules correct 30; quantity groups recognized 0/3; conditional groups found 0/4.
- **Orders:** correct 3 (h1, h7, h9; 569–739 ms), safe refusal 4 (h2, h5, h8, h10), **unsafe 3** (h3, h4, h6), not learned 0. Cart lines read in 0 of 10, so the 3 correct orders are judged by the total only (I-183).

## What it did well
- Every item, price, category and sold-out mark, including the second page of two tabs (it wrote `page2AddToCart` and `page2DirectAddToCart` recipes with the `▶` arrow).
- Separate recipes for items that go straight into the cart on a tap (`directAddToCart`, qty by tapping the tile again) and for the single-combo wizard (`singleCombo`: `다음` between steps, then `장바구니 담기`, then closes the upsell with `clickIfVisible 아니요`).
- Both pickup choices mapped (`지금 바로 수령`, `상영관 입장 전 수령`).

## Where it failed
- **Unsafe (h3, h4, h6):** the qty step clicks role button `수량 더하기`, which matched 2–3 buttons on the screen (Playwright strict mode), so the replay stopped after clicks had already been made. The skill never says which line's or which sheet's `+` to use.
- **Safe refusals (h2, h5, h8, h10):** the 커플 and 스페셜 combos record the two-drink pick as "콜라 더하기"-style option names (the steppers' button text) and use the common `addToCart` recipe, not the wizard; orders naming a plain drink cannot be expressed. 패밀리 콤보 has no option groups at all.
- Quantity options (0/3) and conditional groups (0/4) were not modelled, as the known gaps in `docs/KIBO_LEARN.md` predicted.
- `주문하기` (checkout) is listed in `uiLabels`; no recipe clicks it.
