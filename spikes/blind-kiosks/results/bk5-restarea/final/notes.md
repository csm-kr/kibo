# bk5-restarea, final (fresh hold-out, learner after the I-193 fix)

**Fresh test set** (`../../../PROTOCOL.md` "Fresh test set"): built by an independent agent from a short brief, kept outside the repo while the learner was changed, never opened before this run. Learner `spikes/kibo-learn/learner.mjs` as left by 13-blind-kiosks:7 (step-4 learner plus the I-193 whole-label payment rule, `spikes/kibo-learn/CHANGES.md`), `PROVIDER=gemini` (`gemini-3.8-flash`), `MAX_INPUT_TOKENS=2000000`, `TRACE_DIR=trace/`, `KIOSK_ID=bk5-restarea` (trace label only), a 30 min wall-clock kill in the spawn wrapper (not reached), 10-14 06:40 KST, in parallel with `bk6-themepark`, one run, no crash, no baseline (the fresh set measures only the final learner). Written from `learn.log`, `stderr.log`, the trace, `skill.json` and `grade.json` (the answer key, brief and app source were not read).

## Outcome
**Finished through the gate**: 89 turns, 116 acts, 13.5 min, 843,596 input tokens (556,135 cached, 66%), 24,362 output (`learn-stats.json`). Exit code 0. `stderr.log` holds one line: a Vertex HTTP 429, retried once after 5 s and answered.

| Call | Turn | Result |
|---|---|---|
| audit #1 | 79 | OK, missing 0, unknown 0, hidden 0 |
| testSkill #1 | 82 | PASS PASS PASS, lint 5 |
| audit #2, #3 | 83, 86 | OK, items missing options 5 |
| testSkill #2, #3 | 84, 85 | PASS (lint 1), PASS |
| testSkill #4 | 87 | PASS PASS PASS |
| finish | 88, 89 | finish audit OK, accepted |

Grade (`grade.json`, the grader of 13-blind-kiosks:7):
- **Catalog:** items 31/31 (precision 1), price 31/31, category 31/31, sold out 31/31.
- **Options:** items exact 4/10 (openable 4/9); groups found 14/15, labels exact 9, rules correct 14; quantity groups 0 (none in the key); conditional 0 (none in the key).
- **Orders:** correct 4 (h2, h5, h8, h10; 376–556 ms), safe refusal 3 (h1, h6, h7), **unsafe 3** (h3, h4, h9), not learned 0. Cart lines read in 0 of 10, so the 4 correct orders are judged by the kiosk total only (I-183); the grade lists 3 chosen options there the total cannot confirm (h5 콜라, h10 김치찌개 and 보통).

## Where it failed
- **Unsafe, take-out orders 100원 short (I-195).** The 3 unsafe orders are exactly the 3 orders with `포장하기` (take-out); each shows a kiosk total 100원 below the answer key (11,500 vs 11,600; 18,000 vs 18,100; 20,500 vs 20,600), and the 4 eat-in orders that ran all match. The skill does tap `포장하기` (trace turn 70, the header then shows `포장`), and the cart on the menu screen shows no extra charge on take-out (trace turn 75: 3,000원 + 10,000원 = 총 13,000원). So the key's 100원 is most likely a take-out charge added after `주문하기`, a screen the learner may never open; unverified, because the key and the app were not read.
- **Safe refusals, misspelled option name (I-196).** For the six noodle dishes the skill's size group clicks the kiosk's own label `곱빼기` (`select`), but names the option `곱배기` (a common misspelling). The grader maps orders by option name, so the three orders with `곱빼기` (h1, h6, h7) were refused before any click. Safe, but those orders could not be placed.
- Options exact only 4/10: the size groups above (5 items), and `물냉면` has no `곱빼기` group at all.

## What it did well
- Opened every item once with `취소` in between (turns 15–48) and both set wizards with `다음`/`이전` (turns 9–14, 51–57); sets are recorded with the wizard step as `after`, and both set orders that ran (h5, h10) match the total.
- Answered the gift-box popup (`확인`, turn 43) and recorded the `수량 더하기` stepper for cart quantity (turn 66).
- Audit before the first test, several acts per turn; about 42% of the cap.
- **No checkout or payment taps** while learning.
