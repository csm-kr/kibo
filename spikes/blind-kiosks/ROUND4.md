# KIBO Learn, round 4 (10-14) — state at hand-off

Round 4 fixes why round 3's fresh kiosks failed: `bk7-bubbletea` learned 31/31 items but refused all 10 orders (no sweetness group, `50%` tapped in the recipe, the set popup always declined), and `bk8-tableorder` never finished (a gate that could not be met). The fixes are general, built test-first on synthetic fixtures and the dev set; no kiosk-specific label list.

**Everything measured on bk5, bk7 and bk8 is "informed"**: their round-3 results (and bk7's app and key) were read to make these changes, so they never count as unseen-kiosk results again.

**Frozen learner: commit `a9522a4`** (`spikes/kibo-learn/` and `spikes/blind-kiosks/grade/`). Later commits on `learn-r4` change only docs and result files.

**State at hand-off (10-14, ~13:30 KST, the machine was running out of battery):** code, tests and docs are done and committed; the informed measurements are **not** done. One informed bk7 run was started and stopped by hand after 6.9 min (turn 83, during its first audit), so it has no skill and no grade. Doughhouse (regression) and bk8 were not run. See "Not run yet".

## What changed and why (details: `spikes/kibo-learn/CHANGES.md` "round 4")
1. **Root cause: the option-name lint refused real choices** (I-300). An option name needed a letter, so `0%`…`100%` were "controls": bk7's first self-test said `lint=100` and the learner dropped the required sweetness group and tapped `50%` for every customer ("린트 규칙과 충돌", its notes). The stepper rule `/(더하기|빼기|증가|감소)$/` matched inside `곱빼기` (a large portion): bk5 (`lint=5`) and bk8 (`lint=3`) renamed it `곱배기`, which is the cause of I-196. Now (`isControlLabel`, `plan.mjs`) a control has no letter and no digit, is a navigation word, or ends with a navigation or stepper word as a whole word. Third occurrence of the class: rule R-015 (proposed).
2. **A required choice is an option group, never fixed in a recipe** (I-301). The lint refuses a recipe step that taps an option name. The audit now replays the simplest line of each kind of item and **fails** (`hardClicks`) when a step written with a fixed label taps one of several look-alike buttons (same tag, role and first class) — always on the item's own screen; on a popup after it when the popup shows prices and the skill does not declare it — and (`requiredChoices`) when the kiosk does not add an item while the skill leaves out a choice its screen shows. Plain look-alike chips now count as choices in `missingOptions`. On the round-3 bk7 skill the new audit reports both taps (`50%` on the item screen with 0/30/70/100% as alternatives; `음료만 주문할게요` on the priced set popup); with the `50%` tap removed it lists the 20 tea drinks in `requiredChoices` (cart total 0원 after the simplest order). Payment controls, yes/no answers and disabled (sold-out) buttons are never choices.
3. **Popups that change what is ordered**: `chooseOptions` may name `groups` and run them where it stands (after the add button); a conditional group the line does not use is skipped with its `after` steps; or the skill declares `declines: [{choice, offer}]` when it always declines (only on a popup, never an item-screen choice). Older skills plan the same steps (28 learned skills checked, none uses either case; the run-3 and round-3 Doughhouse skills replay the holdout 4/4 with the violation detected).
4. **bk8's unmeetable gate**: a 0원 running total (`🧾 주문 내역 0원`) was counted as a priced tile missing from the catalog, so every audit failed (I-302); now an amount of 0 is not a price. On a pay-later device the gate asked for `review` while every review was flagged `reviewUnsafe` (I-303); now the gate stops asking once a self-test showed the order button sends the order. The new audit passes bk8's round-3 last skill.
5. **Speed**: `testSkill`/`audit`/`finish` take `skillPatch` (a merge patch; catalog entries merge by name) and skills may use `sharedGroups`, so a fix is not a full resend (round-3 bk7: 7 resends of ~13k tokens, ~78k of 83k output tokens). The audit keeps item screens and line replays for the run: Gureum first audit 68 s, the next 4 s (about 25 s each before). Caps unchanged.
6. **Grader** (pre-registered here, before any round-4 fresh run): a key option whose label is a declared `declines` choice is left to the recipe, like a kiosk default; the offer itself is refused. Skills without `declines` grade as in round 3.

## Tests (run on 10-14 in this worktree, no AI)
`node --test spikes/kibo-learn/patterns.test.mjs spikes/kibo-learn/learner.test.mjs spikes/kibo-learn/viewport.test.mjs` **66/66** (44 + 21 + 1; 14 new), `node --test spikes/blind-kiosks/grade/test/` **33/33** (1 new), `node spikes/kibo-learn/test_audit.mjs <pizzaUrl> <blindUrl>` **4/4** (about 3 min, was 1.5). Each new test failed or could not load before its code; the old lint and planner were also checked by hand on the new fixture (6 lint errors on `0%`; both `chooseOptions` ran every group), and the old audit on the running-total fixture (`missingItems: ["🧾 주문 내역 0원"]`).

## Informed results so far
| Kiosk | Run | Result | Evidence |
|---|---|---|---|
| bk7-bubbletea | round 3 fresh (`learn-r3`) | finished, 76 turns, 27.3 min; orders 0 / 10 / 0 | `learn-r3` branch `results/bk7-bubbletea/final/` |
| | **round 4 informed, attempt 1: stopped by hand** | 82 turns in 6.9 min (round 3 needed 27.3 min for 76), then stopped during its first audit (hand-off); first self-test `FAIL uncovered=10` (`no "타피오카 펄" near "토핑 선택"`); its first skill send was 4,044 output tokens (round 3: ~13,300); 895,649 input tokens, 6,855 output over 82 turns. No skill, no grade | `results/bk7-bubbletea/round4-informed/` (`learn.log`, `trace/`, `wrapper.json`; no `learn-stats.json`, the process was stopped) |

Cost so far: that attempt, at most $0.70 (input billed as uncached, `gemini-3.8-flash` prices in `evidence/cost-per-order.json`; the cached share was not recorded because the run was stopped). Tests use no AI.

## Not run yet (next session)
With `a9522a4` and the spawn wrapper pointed at this worktree's learner (`gemini-3.8-flash`, 2M input-token cap, 30 min kill, `TRACE_DIR`, one at a time): bk7 informed attempt 2 (the stopped attempt is reported as above, not hidden), Doughhouse regression, then bk8 informed (`KIOSK_VIEWPORT=1280x800`). Grade each with this worktree's grader into `results/<kiosk>/round4-informed/` (`grade-v2.json`). Budget left of USD 3: about $2.30.

## What the product bridge should adopt (proposal, `src/` not changed)
1. The whole-word control rule and the 0원 rule where the bridge or converter classifies labels (`src/lib/bridge/labels.ts`), with I-300's test cases.
2. `chooseOptions.groups` and skipping a conditional group with its `after` steps in `src/lib/bridge/recipe.ts` `planSteps` (today it runs every group at each `chooseOptions` and every `after`); `appliesWhen` in the converted skill schema.
3. `declines` in the skill schema, so the phone can say the kiosk's offer is always declined and refuse an order that wants it.
4. Round 3's list still applies (I-215).

## Fresh test set (round 4)
Two new kiosks, built by independent agents under the Builder rules of `PROTOCOL.md`, will be learned **once** each with the frozen learner `a9522a4`, one at a time, same caps (`gemini-3.8-flash`, 2M input-token cap, 30 min kill, `TRACE_DIR`), graded with the grader at that commit (round-3 rules: `orderType`/`mode` aliases, `gradedTotal`, `KIOSK_VIEWPORT` from the brief's device size; plus the `declines` rule above). Nobody who changed the learner has seen them. The learner is not changed after seeing them; no rerun except once after a crash. Their results will be the round-4 unseen-kiosk numbers; the informed runs above are not.

## Limits
- No informed result yet shows that the fixes raise bk7's or bk8's orders; the evidence so far is the tests and the new audit's verdicts on the round-3 skills.
- The hard-click check has blind spots (I-304): popups without prices, yes/no answers, look-alikes drawn differently, and taps that happen only after a non-first option.
- `charges` are per order, so bk7's 200원 cup fee per drink cannot be predicted for take-out orders with several drinks (the grader uses the kiosk's own total).

### Rules fixed before the fresh runs (orchestrator, 10-14 13:40 KST)
Committed before either fresh kiosk is learned. The orchestrator read only the two answer keys' order-level fields to write them.
- **Kiosks:** `bk9-bunsik` (Korean snack bar) and `bk10-chicken` (fried-chicken shop, eat-in or pickup), both portrait kiosks, so the learner's default 1080×1600 browser (no `KIOSK_VIEWPORT`). Built 10-14 by two independent agents from short briefs; kept outside the repo until the commit after this one.
- **Order of runs:** the Mac is on battery, so the two fresh runs go first (bk9, then bk10, one at a time), and the informed runs (bk7 attempt 2, Doughhouse, bk8) after them. The learner is frozen at `a9522a4`, so the order changes nothing about either set.
- **Grading:** grader at this commit with the round-3 rules and the `declines` rule above. Both keys name the dine choice with `dine` (the kiosk's own label). bk10's `pickupTime` (a pickup slot with no price effect) is not graded: the grader checks the kiosk total and cart lines, and the slot shows in neither; recorded as a limit. A key `note` describes how a customer might reach the order, not part of it.
- One learning run per kiosk (`gemini-3.8-flash`, 2M input-token cap, 30 min kill, `TRACE_DIR`), no rerun except once after a crash; both reported whatever the result.
