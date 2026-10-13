# bk2-bakery, baseline (phase-12 learner + I-185 crash fix only)

Learner `spikes/kibo-learn/learner.mjs` with only the I-185 fix (`spikes/kibo-learn/CHANGES.md`), `PROVIDER=gemini` (`gemini-3.8-flash`), `MAX_INPUT_TOKENS=2000000`, 10-13, one run. Written from the log and `grade.json` only (the answer key, brief and app source were not read). The first two runs, which crashed at the nudge, are in `../baseline-crashed/`.

## Outcome
**No skill: the run reached the input-token cap.** It stopped after turn 77 with 2,007,149 input tokens (cap 2,000,000), 6,357 output tokens, 65 acts, 7 `testSkill` calls, 10.3 min (`learn-stats.json`). This is the protocol's budget stop, not a crash, so there is no rerun. The I-185 nudge never fired in this run (its last test was turn 58, and the nudge needs 60 turns without one).

Grade (`grade.json`): items 0/40, every one of the 10 holdout orders `notLearned`.

| Call | Turn | Result |
|---|---|---|
| audit #1 | 51 | GAPS: missing 40, unknown 0, hidden 3 |
| testSkill #1–#7 | 52–58 | PASS, PASS, FAIL, FAIL, PASS, PASS, FAIL, each with **one** order (the gate needs ≥ 3 in one call) |

## What it did well
- Started an order on its own (`포근밀`, then `매장에서 먹어요`) and found the coffee, bread and non-coffee tabs.
- Found the cart controls (`전체삭제` → `비우기`) and the `계속 주문하기` way back, and used `reload` to start over cleanly at turn 59.
- Wrote a first skill by turn 51 and tested it, earlier than the cinema run.

## Where it failed
- **Turns 6–21 went to one drink sheet:** it tried `HOT` six ways (label, name, role button, role radio `check`, text) and the extra-shot stepper (`+`, `수량 증가`, `에스프레소 샷 증가`, `증가`) about ten ways. The sheet's temperature choice and the shot stepper were hard to target with the driver's labels; quantity options are a known gap (`docs/KIBO_LEARN.md`).
- The audit at turn 51 found none of 40 priced tiles in the audited skill's catalog (the log does not print the skill, so why is unverified). It then tested single orders seven times instead of recording items.
- **Cost:** about 26,000 input tokens per turn on average, so the 2M cap allowed only 77 turns; turns 59–77 were spent opening and closing coffee items one by one (`카페라떼` … `에스프레소`) and the cap ended the run before any of them could be written into a skill.
