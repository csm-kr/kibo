# bk2-bakery, baseline (current learner, unchanged)

Learner `spikes/kibo-learn/learner.mjs`, `PROVIDER=gemini` (`gemini-3.8-flash`), `MAX_INPUT_TOKENS=2000000`, 10-13. Written from the logs and `grade.json` only (the answer key and brief were not read).

## Outcome
**No skill.** Both runs stopped with HTTP 400 from Vertex AI, `"Requests ending with a model turn are not supported."` (I-185, the same error as `bk1-cinema`), and the learner's loop ends on any API error without retry. Neither run called `finish`.

| Run | Files | Turns | Acts | `record` calls | Self-tests | Audits | Input / output tokens | Minutes |
|---|---|---|---|---|---|---|---|---|
| 1 (crash) | `crash1/learn.log`, `crash1/learn-stats.json` | 81 | 57 | 23 | 0 | 0 | 496,584 / 2,861 | 4.5 |
| 2 (the one allowed rerun, PROTOCOL "Runs") | `learn.log`, `learn-stats.json` | 101 | 72 | 28 | 2 (turns 29, 30: FAIL, then PASS) | 2 (turns 12, 13: one GAPS line printed, missing 40, unknown 3) | 1,581,998 / 5,615 | 7.5 |

Grade (`grade.json`): items 0/40, every one of the 10 holdout orders `notLearned` (no skill to replay).

## Why it stopped (cause unverified, but consistent)
Run 1 failed on turn 81, run 2 on turn 101. Both are the request right after a turn where the learner's "stop exploring" nudge fires (`stats.turns - lastTestTurn > 60 && stats.turns % 20 === 0`): run 1 had no test (80 − 0 > 60), run 2 last tested on turn 30 (100 − 30 > 60). All four baseline crashes so far (two per kiosk) happened exactly there, and none elsewhere. Not checked against the API.

## What it did well
- Started an order on its own: the attract screen (`포근밀`), then dine-in (`매장에서 먹어요`).
- Run 2 called `audit` and `testSkill` early (turns 12–30), before exploring, which none of the cinema runs did; its second test passed (how many orders it held is not in the log; `finish` needs ≥ 3 in one call).
- Opened most tiles of 커피, 논커피 and 티 in run 2 and of 빵, 케이크, 샌드위치 in run 1, closing each sheet with `취소` or `✕`, and cleared the cart (`전체삭제` → `비우기`) between tries.
- Picked a temperature (`HOT`) before `담기` once it saw that adding without it did nothing (turns 40–42 of run 2).

## Where it failed
- **Extra shot stepper:** it tried `+` by label, by role and name, by text `에스프레소 샷 +500원`, by name `샷` and `수량`, and `증가` (run 1 turns 8–9, run 2 turns 7–11, 23–25, 37). The log does not say which tap worked; the skill schema has no quantity option type (KIBO_LEARN "Known gaps" 1).
- **One run never saw the whole menu:** run 1 never returned to the drinks after 아메리카노, and run 2 never opened 빵, 케이크 or 샌드위치, because each crashed first. Run 2's first audit found 40 priced tiles missing from its draft skill.
- **Token use:** run 2 used 1.58M input tokens by turn 101 (about 3.2 times run 1 over 20 more turns), apparently because test and audit results stay in the history unpruned (only screen trees are pruned). At that rate it would have hit the 2M cap after a few dozen more turns.
- Run 1 sent one malformed step (`{"label":"취소","op":"취소"}`, turn 21).
- Run 1 tapped `계속 주문하기` ("continue ordering") once; whether that was the 처음으로 timeout modal is not visible in the log.
