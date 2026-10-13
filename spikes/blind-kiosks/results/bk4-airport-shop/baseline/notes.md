# bk4-airport-shop, baseline (phase-12 learner + I-185 crash fix + I-187 exit fix only)

Learner `spikes/kibo-learn/learner.mjs` with only the I-185 and I-187 fixes (`spikes/kibo-learn/CHANGES.md`; neither changes how it explores), `PROVIDER=gemini` (`gemini-3.8-flash`), `MAX_INPUT_TOKENS=2000000`, a 30 min wall-clock kill in the spawn wrapper (not reached), 10-13. Written from the logs and `grade.json` only (the answer key, brief and app source were not read).

Two runs, as PROTOCOL allows for a crash:
- `crash1/`: stopped at turn 127 (21.0 min, 1,945,896 input tokens) on Vertex HTTP 401 "Request had invalid authentication credentials" (`crash1/learn.log:133`), an expired access token, not a learning outcome (I-188). No skill was written.
- This folder: the one rerun, started right after the 401. It is the reported baseline.

## Outcome
**No skill: the rerun reached the input-token cap.** It stopped after turn 113 with 2,002,024 input tokens (cap 2,000,000), 9,479 output tokens, 80 acts, 1 `testSkill` call, 11.1 min (`learn-stats.json`); the process exited by itself. A budget stop, not a crash, so no further rerun.

| Call | Turn | Result |
|---|---|---|
| testSkill #1 | 94 | PASS PASS PASS |
| audit #1 | 95 | GAPS: missing 17, unknown 0, hidden 0 |
| (cap) | 113 | after 13 more acts in 간식, 여행용품, 기념품 and 5 `record` calls |

Grade (`grade.json`): items 0/37, every one of the 10 holdout orders `notLearned`.

For comparison only (not the reported number): the 401-crashed first run had passed the audit (`crash1/learn.log:129`, audit #2 OK) and one 3-order test (turn 120), but its last test before the crash was PASS PASS FAIL and it never called `finish`.

## What it did well
- Started an order on its own and found the heated-food choice (`데워 주세요`, turns 6, 91) and the `원 담기` add button.
- Its first skill (turn 94) passed a 3-order self-test.
- Handled the confirm dialog after the beer tile with `예` (turns 68–69; what the dialog said is not in the log).

## Where it failed
- **Budget:** about 17,700 input tokens per turn. It saved findings one per turn (`record` at turns 18–24, 32–37, 72–79, 109–113; 26 turns in all), and opened and cancelled items one per turn, so the cap came before the 17 items the audit found missing were written into a skill.
- **Extra-shot stepper (turns 40–45, 49, 53–54):** tried `+` as role, label and text, `에스프레소 샷`, `샷`, `에스프레소`, `추가`, `수량`. The crashed run did the same at turns 43–50. Quantity options are a known gap (`docs/KIBO_LEARN.md`).
- **Exploration went into checkout:** turn 9 tapped `주문하기`; the crashed run also tapped `결제하기` (`crash1/learn.log:11`). Harmless here, but on a real kiosk the learner approached a payment step.
- The crashed run spent turns 82–105 on 24 `record` calls in a row.
