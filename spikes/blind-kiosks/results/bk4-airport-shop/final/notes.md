# bk4-airport-shop, final (learner of 13-blind-kiosks:4)

Learner `spikes/kibo-learn/learner.mjs` as left by 13-blind-kiosks:4 (`spikes/kibo-learn/CHANGES.md`), `PROVIDER=gemini` (`gemini-3.8-flash`), `MAX_INPUT_TOKENS=2000000`, `TRACE_DIR=trace/`, `KIOSK_ID=bk4-airport-shop` (trace label only), a 30 min wall-clock kill in the spawn wrapper (not reached), 10-14 (about 06:00 KST, in parallel with `bk3-ramen`), one run, no crash, no 401 (the token renewal of I-188 was not needed in 8 min). Written from `learn.log`, the trace (`trace/turn-<n>.json`, `.jpg`), the learned `skill.json` and `grade.json` (the answer key, brief and app source were not read).

## Outcome
**Finished through the gate**: 64 turns, 64 acts, 8.1 min, 666,077 input tokens (394,579 of them cached, 59%), 13,569 output (`learn-stats.json`). The process exited by itself (exit code 0); stderr was empty.

| Call | Turn | Result |
|---|---|---|
| audit #1 | 62 | OK, missing 0, unknown 0, hidden 0, items missing options 0 |
| testSkill #1 | 63 | PASS PASS PASS |
| finish | 64 | accepted (finish audit OK) |

Grade (`grade.json`, the grader of 13-blind-kiosks:4):
- **Catalog:** items 37/37 (precision 1), price 37/37, category 37/37, sold out 37/37.
- **Options:** items exact 12/12 (openable 12/12); groups found 17/17, labels and rules correct 17; quantity groups recognized 2/2 (the extra shot); conditional groups 0 (none in the key).
- **Orders:** correct 10 (h1–h10; 333–760 ms), safe refusal 0, **unsafe 0**, not learned 0. Cart lines read in 0 of 10, so all 10 are judged by the kiosk total only (I-183). The grade lists 7 chosen options the total cannot confirm (heating, sauce, the neck pillow's color); a wrong pick there would still count as correct.

## Baseline → final
| | Baseline (`../baseline/grade.json`) | Final |
|---|---|---|
| Finished | no: input-token cap at turn 113 (2,002,024 input, 11.1 min; a 401 crash before that, `../baseline/crash1/`) | yes, 64 turns, 8.1 min, 666,077 input (59% cached) |
| Items / price | 0/37 (no skill) | 37/37, 37/37 |
| Quantity groups | 0/2 | 2/2 |
| Orders correct / safe refusal / unsafe / not learned | 0 / 0 / 0 / 10 | **10 / 0 / 0 / 0** |

The baseline had no skill; its re-grade with this step's grader (`../baseline/regrade-step4/grade.json`) is the same.

## What it did well
- **Extra-shot stepper** (the baseline's failed tries at turns 40–54): `+` `within` `에스프레소 샷 +500원` at turn 29, recorded as a `quantity` group.
- **Budget:** findings saved in 6 `record` calls (the baseline used 26 turns for them), several acts per turn, an audit before the only test; about a third of the baseline's capped input.
- **Age-restricted item:** the confirm after `활주로 라거 500ml` is answered with `clickIfVisible 예` in `addToCart` (turns 31–33).
- **1+1 promotions:** noted that the free line is added by the kiosk itself (`notes`), so the skill does not add it twice; orders with those drinks match the total.
- The ambiguous `담기` (turn 8, "matches 4 elements") was fixed the next turn with `within 취소`, as the driver's message suggests.
- **No checkout or payment taps** during exploration (the baseline tapped `주문하기`, its crashed run `결제하기`); `주문하기` is in `forbiddenLabels`.

## Where it failed
- The kiosk has no dine-in or take-out choice; the skill fills both `dineOptions` with the start-screen label `화면을 터치하여 주문을 시작하세요`, a workaround for the skill format, not a real choice.
- For items without options, `qty > 1` taps the item tile again; the tile's own quantity stepper was not used (the orders still match the total).
- It chose Korean at turn 3 and never explored the English mode; the skill holds Korean labels only.
- Only one `testSkill` call (3 orders), the minimum the gate accepts; the log does not print which orders it tested.
