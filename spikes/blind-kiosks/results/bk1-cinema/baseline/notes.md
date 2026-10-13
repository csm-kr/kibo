# bk1-cinema, baseline (current learner, unchanged)

Learner `spikes/kibo-learn/learner.mjs`, `PROVIDER=gemini` (`gemini-3.8-flash`), `MAX_INPUT_TOKENS=2000000`, 10-13. Written from the logs and `grade.json` only (the answer key and brief were not read).

## Outcome
**No skill.** Both runs stopped at turn 81 with HTTP 400 from Vertex AI, `"Requests ending with a model turn are not supported."`, and the learner's loop ends on any API error without retry. Neither run had called `testSkill`, `audit` or `finish`.

| Run | Files | Turns | Acts | `record` calls | Input / output tokens | Minutes |
|---|---|---|---|---|---|---|
| 1 (crash) | `crash1/learn.log`, `crash1/learn-stats.json` | 81 | 68 | 12 | 514,964 / 2,577 | 2.8 |
| 2 (the one allowed rerun, PROTOCOL "Runs") | `learn.log`, `learn-stats.json` | 81 | 59 | 21 | 495,133 / 3,249 | 3.0 |

Grade (`grade.json`): items 0/32, every one of the 10 holdout orders `notLearned` (no skill to replay).

## Why it stopped (cause unverified)
Both runs failed on the request of turn 81, the first request after turn 80. Turn 80 is where the learner's "stop exploring" nudge first fires (`stats.turns - lastTestTurn > 60 && stats.turns % 20 === 0`, with no test yet `lastTestTurn` is 0): it appends a text part to the same user turn as the function responses. The same turn number in two runs that took different paths points to that nudge, not to the model's output; this was not checked against the API. Logged as I-185.

## What it did well
- Started an order on its own: tapped the attract screen (`별무리 시네마`), then the pickup choice (`지금 바로 수령`).
- Found the six category tabs (콤보, 팝콘, 음료, 스낵, 핫푸드, 디저트) and used the pager arrows (`▶`, `◀`) to reach tiles on the second page.
- Walked the combo wizard with `다음` / `이전` (size `M (기본)`, flavor, drink), tried the half-and-half (`반반`) flavor pick, and in run 1 reached the post-combo popup and declined it (`아니요`).
- Closed item sheets with `✕` or `취소` and cleared the cart (`전체 삭제` → `확인`) between items, so exploration did not pile up lines.

## Where it failed
- Spent all 80 turns exploring one item at a time and never wrote a skill, so the nudge was its first push to test; in both runs that push is where it crashed.
- The half-and-half pick needed three tries (`label` "오리지널", then `exact`, then `text` "오리지널 카라멜 +500원"), a sign that two tappable labels started with the same flavor name.
- Run 2 clicked `주문하기` (the checkout button) once while exploring, then went back with `이전`; harmless during learning, but it is a label the grader forbids in recipes.
- Records hold the findings only in memory; with no `finish`, nothing of the 12 and 21 recorded items survives the run (the log prints `record` without its data).
