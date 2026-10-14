# bk6-themepark, round 3 (informed)

**Label: round 3, informed.** I-197 was raised from this kiosk's fresh hold-out run and round 3's coverage gate answers it, so this run never counts as an unseen-kiosk result (`../../../ROUND3.md`). `../final/` stays the fresh hold-out number.

Learner `spikes/kibo-learn/` at `ea28477` (`learner.dirty: false`), `gemini-3.8-flash`, `MAX_INPUT_TOKENS=2000000`, `TRACE_DIR=trace/`, `KIOSK_ID=bk6-themepark`, 30 min wall-clock kill (not reached), 10-14 11:01 KST, in parallel with bk5, one run, no crash, `stderr.log` empty. Graded at the same commit (`grade-v2.json`).

## Outcome
**Finished**: 79 turns, 93 acts, 11.2 min, 1,324,817 input tokens (940,563 cached, 71%), 18,341 output; $0.43. Early audits (turns 15–25) listed 24–25 missing items; audit OK at 70. testSkill #1 FAIL (`no tappable label "eat_in"`: the test order gave the dine key instead of its label) and #2 FAIL (skill total 11,000 vs the kiosk's 9,000), both with 10 option groups unused; #3 PASS with 9 unused; #4 PASS PASS PASS with every group used (turn 77); audit and finish accepted (78, 79). The skill declares the membership popup as an interrupt (`"회원이신가요?"` → `비회원으로 계속`) and the order review (`openReview 주문하기`, `총 결제 금액…`, back with `이전`).

| | `../final/` (fresh hold-out, phase 13) | round 3 (informed) |
|---|---|---|
| Orders correct / safe refusal / unsafe | 10 / 0 / 0 | **10 / 0 / 0** (kiosk total read on the review in 10) |
| Skill total wrong (of orders with a kiosk total) | 4 of 10 (h2, h3, h9, h10) | **2 of 10 (h2, h3)** |
| Items, prices | 25/25, 18/25 | 25/25, 18/25 |
| Options items exact; quantity; conditional | 10/18; 7/7; 0/4 | 10/18; 0/7; 0/4 |

- h2 and h3 still differ (skill 101,000 vs kiosk 91,000; 73,000 vs 65,000): the ticket discount (`장애인 우대` −10,000, `경로 우대` −8,000) is applied per person by the kiosk and once per line by the skill (I-197). The coverage gate made the self-tests use a discount, but with one person, where both agree; a per-person price cannot be expressed in the skill format. On a phone the runner's verified total (the kiosk's) would be quoted, with the mismatch flagged.
- Quantity groups 0/7: the passenger counts are quantity groups again, with `maxQty` 10 where the key has another maximum (the grader counts a quantity group only with the same `maxQty`).
- The skill's `cartTotalPattern` (`합계…`) does not match the menu screen (the cart is a closed drawer), so the menu-cart view (`cartOnlyOutcome`) reads no total in any order (0 / 0 / 10). The runner never checks the cart pattern when a review is declared: logged in `docs/ISSUE.md`.
