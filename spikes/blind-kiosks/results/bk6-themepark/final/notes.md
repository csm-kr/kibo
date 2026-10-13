# bk6-themepark, final (fresh hold-out, learner after the I-193 fix)

**Fresh test set** (`../../../PROTOCOL.md` "Fresh test set"): built by an independent agent from a short brief, kept outside the repo while the learner was changed, never opened before this run. Learner `spikes/kibo-learn/learner.mjs` as left by 13-blind-kiosks:7 (step-4 learner plus the I-193 whole-label payment rule, `spikes/kibo-learn/CHANGES.md`), `PROVIDER=gemini` (`gemini-3.8-flash`), `MAX_INPUT_TOKENS=2000000`, `TRACE_DIR=trace/`, `KIOSK_ID=bk6-themepark` (trace label only), a 30 min wall-clock kill in the spawn wrapper (not reached), 10-14 06:40 KST, in parallel with `bk5-restarea`, one run, no crash, no baseline. Written from `learn.log`, the trace, `skill.json`, `grade.json` and one diagnostic replay of h7 with the unchanged runner (the answer key, brief and app source were not read).

## Outcome
**Finished through the gate**: 87 turns, 111 acts, 12.7 min, 1,284,672 input tokens (862,085 cached, 67%), 28,615 output (`learn-stats.json`). Exit code 0, `stderr.log` empty.

| Call | Turn | Result |
|---|---|---|
| audit #1, #2 | 8, 9 | GAPS, missing 25 / 24, hidden 1 (early, before exploring) |
| audit #3 | 69 | GAPS, missing 24, hidden 1 |
| testSkill #1 | 70 | FAIL, lint 3 |
| audit #4, #5 | 77, 78 | GAPS missing 24, then OK |
| audit #6 | 84 | OK |
| testSkill #2 | 85 | PASS PASS PASS |
| audit #7, finish | 86, 87 | OK, accepted |

Grade (`grade.json`, the grader of 13-blind-kiosks:7):
- **Catalog:** items 25/25 (precision 1), price 18/25, category 25/25, sold out 25/25.
- **Options:** items exact 10/18 (openable 14/17); groups found 21/22, labels exact 14, rules correct 14; quantity groups recognized 7/7 (the passenger counts); conditional 0/4.
- **Orders, as graded:** correct 0, safe refusal 0, **unsafe 10**, not learned 0. Cart lines read in 10 of 10. Every result says "the kiosk cart lacks <item>".
- **Kiosk total: equal to the answer key in 10 of 10** (h1 84,500 … h10 93,500; 507–1,580 ms). By the total-only rule used for every other kiosk (none of which had cart lines read), all 10 would count as correct; 7 chosen options there cannot be confirmed by the total (sauces, 대인).

## Why every order is "unsafe" (I-183)
The runner's "cart lines" are every `listitem` of the page snapshot. This kiosk's category tabs are list items, and the cart is a drawer behind the `장바구니` button, which stays closed. A diagnostic replay of h7 with the unchanged runner (souvenirs only, total 36,000원 as expected) returned exactly five lines: `입장권`, `자유이용권`, `간식`, `음료`, `기념품`. So the grader compared item names against the category tabs and none matched. The skill also lists `장바구니` in `forbiddenLabels`, so no recipe opens the drawer. The verdict is the grader's rule applied to the wrong text; whether the cart's lines are right is **unverified** (the totals match, the names were never read). The reported number stays 0 / 0 / 10, per PROTOCOL; the grader is not changed in this step.

## Where the skill is wrong
- **The skill's own totals differ from the kiosk in 4 of 10 orders (I-197):** h2 100,000 vs 91,000, h3 73,000 vs 65,000, h9 194,000 vs 196,000, h10 88,500 vs 93,500 (`skillPredicts` vs `kioskTotal`). Tickets are recorded as price 0 with the passenger counts as a quantity group of absolute fares (대인 29,000, 청소년 25,000, 소인 21,000) and the discount type (`장애인 우대` −10,000, `경로 우대` −8,000) as one flat amount per line; the kiosk computes something else for those orders (cause unverified). A phone built on this skill would quote a wrong total before the kiosk does.
- Price 18/25: the 7 tickets, because of that modelling (the grader compares the base price).
- `고래 꼬리 핫도그`: its four toppings (sauces, ice-cream topping) are missing; conditional groups 0/4.

## What it did well
- Passenger counts: `+` `within` the passenger row (turn 6), recorded as `quantity` groups; all 7 recognized.
- Answered the membership popup with `비회원으로 계속` (turn 27) and closed the cart drawer with `✕` (turns 14, 29, 30).
- Opened every item once with `취소` in between (turns 40–66); after the first test failed on lint it fixed the skill and passed 3/3 at turn 85.
- **No checkout or payment taps** while learning (`주문하기` in `forbiddenLabels`).
