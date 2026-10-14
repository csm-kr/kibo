# bk5-restarea, round 3 (informed)

**Label: round 3, informed.** I-195 was raised from this kiosk's fresh hold-out run and round 3 was built partly to answer it, so this run never counts as an unseen-kiosk result (`../../../ROUND3.md`). `../final/` stays the fresh hold-out number.

Learner `spikes/kibo-learn/` at `ea28477` (`learner.dirty: false`), `gemini-3.8-flash`, `MAX_INPUT_TOKENS=2000000`, `TRACE_DIR=trace/`, `KIOSK_ID=bk5-restarea`, 30 min wall-clock kill (not reached), 10-14 11:01 KST, in parallel with bk6, one run, no crash, `stderr.log` empty. Graded at the same commit (`grade-v2.json`).

## Outcome
**Finished**: 73 turns, 95 acts, 9.3 min, 655,570 input tokens (379,528 cached, 58%), 14,737 output; $0.29. Audit #1 OK (turn 67), testSkill #1 PASS PASS PASS with 5 lint errors (68), #2 PASS PASS PASS (70), finish refused once for `missingOptions` (72) and accepted (73). The skill declares the order review (`openReview 주문하기`, total `총 결제금액…`, back with `메뉴 더 담기`), no `charges`, no interrupts.

Orders **4 correct / 3 safe refusal / 3 unsafe**, the same as `../final/`; skill total wrong 0 of 7. Items 31/31, prices 31/31, options items exact 4/10. The refusals are again the misspelled option `곱배기` for the kiosk's `곱빼기` (h1, h6, h7; I-196, not addressed in round 3).

## The three take-out orders (h3, h4, h9): I-195's cause
- The kiosk's own order review shows the same total as the cart for these orders (11,500, 18,000, 20,500), so the runner's verified total equals the skill's, and the 100원 gap to the answer key remains. **The I-195 hypothesis (a take-out charge added on the review) is wrong for the review screen.**
- An AI-free diagnostic replay of h3 with this skill (a scratch script outside the repo; the same steps as the runner, the review opened with `openReview`, nothing else tapped) printed the review: `식사 방법 : 포장 … 한상세트 왕돈까스 / 식혜 x1 11,500원 봉투가 필요하신가요? 봉투 +100원 주문 금액 11,500원 총 결제금액 11,500원`. The 100원 is an **optional bag** offered on the review for take-out.
- To classify this, the answer key's entries for h3, h4 and h9 were read after this run (field names and the bag field only; the learner was already frozen and is not changed on their account): each has `orderOptions: { "bag": ["bag"] }`, an order-level choice. The grader ignores `orderOptions` (`translateOrder` reads only `lines`), so it replays these orders without the bag and calls the 100원 gap unsafe; by its own rules a choice the skill cannot express is a safe refusal (refused before any click). Logged as a grader issue in `docs/ISSUE.md`; the grade is not changed here, so this run and `../final/` both read 4 / 3 / 3. Under a grader that refused them, both would read 4 / 6 / 0 (computed, not graded).
- The skill format cannot express an order-level choice on the review (a bag), and the gate never asks for a take-out self-test (it covers option groups, not dine choices): logged in `docs/ISSUE.md`.
