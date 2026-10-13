# bk1-cinema, final (learner of 13-blind-kiosks:4)

Learner `spikes/kibo-learn/learner.mjs` as left by 13-blind-kiosks:4 (`spikes/kibo-learn/CHANGES.md`), `PROVIDER=gemini` (`gemini-3.8-flash`), `MAX_INPUT_TOKENS=2000000`, `TRACE_DIR=trace/`, a 30 min wall-clock kill in the spawn wrapper (not reached), 10-14 (05:37 KST), one run, no crash. Written from `learn.log`, the trace (`trace/turn-<n>.json`, `.jpg`), the learned `skill.json` and `grade.json` (the answer key, brief and app source were not read).

## Outcome
**Finished through the gate**: 94 turns, 139 acts, 13.3 min, 977,691 input tokens (609,457 of them cached, 62%), 29,088 output (`learn-stats.json`). The process exited by itself (exit code 0).

| Call | Turn | Result |
|---|---|---|
| audit #1 | 85 | OK, missing 0, unknown 0, hidden 0, items missing options 1 |
| audit #2 | 92 | OK, missing 0, items missing options 0 |
| testSkill #1 | 93 | PASS PASS PASS |
| finish | 94 | accepted (finish audit OK) |

Grade (`grade.json`, the grader of 13-blind-kiosks:4):
- **Catalog:** items 32/32 (precision 1), price 31/32 (`소프트 아이스크림` wrong), category 32/32, sold out 32/32.
- **Options:** items exact 18/25 (openable 21/22); groups found 30/39, rules correct 30; quantity groups recognized 2/3; conditional groups found 0/4.
- **Orders:** correct 6 (h1, h3, h4, h7, h9, h10; 862–1,486 ms), safe refusal 4 (h2, h5, h8: "no way to accept the upsell for 나쵸"; h6: option `슬러시 › 딸기` not in the skill), **unsafe 0**, not learned 0. Cart lines read in 0 of 10, so the 6 correct orders are judged by the total only (I-183).

## Baseline → final
| | Baseline (`../baseline/grade.json`) | Final |
|---|---|---|
| Finished | yes, 109 turns, 7.4 min, 1,068,732 input | yes, 94 turns, 13.3 min, 977,691 input (62% cached) |
| Items / price | 32/32, 32/32 | 32/32, 31/32 |
| Options items exact | 19/25 (openable 20/22) | 18/25 (openable 21/22) |
| Quantity groups | 0/3 | 2/3 |
| Orders correct / safe refusal / unsafe | 3 / 4 / 3 | **6 / 4 / 0** |

The baseline skill was re-graded with this step's grader (`../baseline/regrade-step4/grade.json`, because 13-blind-kiosks:4 moved the grader's plan expansion to `plan.mjs`): the same numbers and outcomes; only the error text of the 3 unsafe orders changed (the new driver names the ambiguous `수량 더하기` and suggests `within`).

## What it did well
- The combo wizards now have their own recipe (`comboOrder`) with each group's `after` step (the wizard's `다음`), and the 커플 and 스페셜 combos model the two-drink pick as a `quantity` group with `select` steps, which the baseline recorded as "콜라 더하기"-style option names.
- No unsafe order: the baseline's ambiguous `수량 더하기` in the cart (strict-mode failures mid-replay) is gone.
- Second-page items kept their own recipes (`page2ItemOrder`, `page2ItemDirect`), as in the baseline; checkout `주문하기` is in `forbiddenLabels`.
- Fewer turns than the baseline and 62% of the input tokens served from the cache; the driver's "matches 2 elements" message was hit once in the trace (turn with `오리지널`).

## Where it failed
- **Upsell (h2, h5, h8):** the skill declines the upsell popup but records no way to accept it, so every order with the upsold item is refused (safe).
- **Half-and-half flavor (`반반`, exactly 2):** not modelled on the combos (the grade lists the 0원 half flavors as missing on all four combos); one act in the trace failed with `no "카라멜" near "반반 +1,000원"`.
- **패밀리 콤보** has no option groups and no recipe of its own, as in the baseline.
- `슬러시` flavors recorded as different names (`콜라맛`, `오렌지맛`, `포도맛`) from the key's, so h6 is refused; `트러플 팝콘` and `자몽에이드` have no size group.
- Conditional groups 0/4, as in the baseline.
- Wall time rose from 7.4 to 13.3 min although turns and tokens fell; likely the per-step label marking (I-191), the audit's option probe and the 139 acts against the baseline's 102 (unverified, not timed per part).
