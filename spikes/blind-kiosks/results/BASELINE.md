# Blind kiosks: baseline

The learner as it was at the end of phase 12, plus the I-185 crash fix (all four) and the I-187 exit fix (bk3, bk4; it only makes the process exit), `PROVIDER=gemini` (`gemini-3.8-flash`), input-token cap 2,000,000, one run per kiosk, 10-13 (`PROTOCOL.md`). Every number below comes from `results/<kioskId>/baseline/learn-stats.json` and `grade.json`; details per kiosk in each `notes.md`. The first bk1 and bk2 runs, which crashed at the "Stop exploring" nudge before the I-185 fix, are kept in `results/bk{1-cinema,2-bakery}/baseline-crashed/`; bk4's first run, stopped by an expired Vertex token (HTTP 401, I-188), is in `results/bk4-airport-shop/baseline/crash1/`.

| Kiosk | Finished through the gate | Minutes | Input tokens | Item recall | Price accuracy | Option groups found (labels exact) | Items with all options exact | Orders correct / safe refusal / unsafe (of 10) |
|---|---|---|---|---|---|---|---|---|
| bk1-cinema | yes (109 turns) | 7.4 | 1,068,732 | 32/32 | 32/32 | 30/39 (28) | 19/25 | 3 / 4 / 3 |
| bk2-bakery | no: token cap (77 turns) | 10.3 | 2,007,149 | 0/40 | – | – | – | 0 / 0 / 0 (10 not learned) |
| bk3-ramen | yes (95 turns) | 20.6 | 1,582,965 | 25/25 | 25/25 | 11/28 (11) | 4/14 | 2 / 6 / 2 |
| bk4-airport-shop | no: token cap (113 turns) | 11.1 | 2,002,024 | 0/37 | – | – | – | 0 / 0 / 0 (10 not learned) |
| **Total** | **2 of 4** | | | **57/134** | 57/57 learned | | | **5 / 10 / 5 of 40** (20 not learned) |

Limits: "correct" is judged by the kiosk total only, because the runner read cart lines in 0 of the 20 orders it ran (I-183). Quantity groups recognized: bk1 0/3, bk3 0/8. Conditional groups found: bk1 0/4 (bk3 has none). One run per kiosk, so run-to-run spread is unknown.

## Failure patterns
Input for 13-blind-kiosks:4, which fixes patterns, not kiosks. Ordered by how many kiosks showed them. Turn numbers are the `#n` in each `learn.log` under `results/<kioskId>/baseline/`.

1. **Quantity steppers in option sheets (4 of 4).** The model cannot target a "− n +" option (topping count, extra shot, drink count) and spends many turns trying label, role, text and exact variants of `+`. None of the quantity groups in the two learned skills is modelled (0/3, 0/8), so every order that needs one is refused.
   - bk1: the couple and special combos record the stepper buttons' text as option names (`콜라 더하기` … `레몬에이드 더하기`, `skill.json:180–196`, `264–280`).
   - bk2: turns 6, 8, 13–15, 18–21 (`에스프레소 샷 증가`, `수량 증가`, `+`, `샷`, `증가`), again 35–37 and 47–49 (`가`, `취`).
   - bk3: turns 9–21 (`차슈` 13 ways, including role `spinbutton` and role `foo`), 55–56.
   - bk4: turns 40–45, 49, 53–54; the 401 run 43–50.

2. **Token budget runs out before the skill is written (2 of 4 over the cap; bk3 at 1.58M, bk1 at 1.07M).** About 9,800 (bk1), 26,100 (bk2), 16,700 (bk3) and 17,700 (bk4) input tokens per turn, and `cachedInputTokens` 0 in every run. bk2 and bk4 hit the 2M cap with no skill; bk3 used 1.58M. What spends the turns:
   - one `record` call per turn: bk4 turns 18–24, 32–37, 72–79, 109–113 (26 turns); the bk4 401 run turns 82–105 (24 in a row).
   - opening and cancelling each item one turn at a time: bk1 turns 17–80, bk2 59–77, bk3 26–38, 59–68, bk4 96–108.
   - see also patterns 1 and 4.

3. **Exploration goes into checkout and payment (3 of 4).** No forbidden labels apply while learning, and the skills list checkout as an ordinary control.
   - bk3 turns 49–50 (`주문하기`, `결제하기`); bk4 turn 9 (`주문하기`), the bk4 401 run turns 10–11 (`주문하기`, `결제하기`).
   - bk1 and bk3 skills list `주문하기` in `uiLabels` and have no `forbiddenLabels`.

4. **Self-tests with one order, which the gate does not count (3 of 4).** The finish gate needs ≥ 3 orders in one `testSkill` call.
   - bk1 turn 83; bk2 turns 52–58 (seven single-order tests, then no skill); bk3 turns 84–91 (six).

5. **Line quantity in the cart is ambiguous at replay (2 of 2 learned skills; all 5 unsafe orders).** `qty > 1` is done by tapping `수량 더하기` after the line is added. With two or more lines (or a sheet open) the label matches 2–3 buttons, Playwright's strict mode stops the replay after clicks were already made.
   - bk1 orders h3, h4, h6; bk3 orders h4, h9 (`grade.json`); bk3 `skill.json:463`, bk1 `skill.json:950`, `995`, `1126`.

6. **Multi-step set or combo wizards (`다음`) recorded without their steps (2 of 4).** The model walks the wizard but the recorded item has no option groups, or uses the plain add recipe, so set orders are refused.
   - bk1 turns 4–13, 21–34, 96–102 (single combo learned as `singleCombo`; 커플 and 스페셜 combos use plain `addToCart` with stepper names; 패밀리 콤보 has no groups).
   - bk3 turns 40–48, 74–79 (`라멘 기본 세트`, `라멘 든든 세트`: no groups, no recipe).

7. **Audit finds missing items after the tests pass, and no budget is left (2 of 4).**
   - bk4 turns 94–95 (3/3 tests, then audit missing 17; cap at 113).
   - bk2 turn 51 (audit missing 40 and hidden 3, then only single-order tests).

8. **Toggle choices that the labels cannot reach (1 of 4).** bk2 turns 7, 9–12, 23: `HOT` tried as label, name, role button, role radio (`check`) and text. bk4's `HOT 따뜻하게` worked with its full label (turn 46), so the label the driver gives a toggle may not be what the model expects.

9. **Conditional option groups (1 of 4 measured).** bk1: 0 of 4 conditional groups found (`grade.json`). Not measurable on bk2 and bk4 (no skill); bk3 has none.

Seen and handled, not failures: paging arrows (bk1 `▶` turns 36, 45, 89; the skill has `page2AddToCart`), an upsell dialog closed with `아니요` (bk1 turn 14, recipe uses `clickIfVisible`), items that go straight into the cart on a tap (bk1 `directAddToCart`, bk3 `clickIfVisible 담기`), and a confirm dialog after an alcohol tile (bk4 turns 68–69, `예`). Native `alert()` text is not printed in the logs, so whether any kiosk raised one is unverified. Icon-only tabs and promotions were not seen in the logs.

Not learner patterns: the expired access token (bk4 401 run, I-188) and the grader's total-only check (I-183).
