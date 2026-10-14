# KIBO Learn

**Learn a kiosk once, turn it into a skill, replay orders without AI.** For kiosks that offer no integration, an agent explores the kiosk's web UI, writes a skill (catalog + click recipes), and proves it with AI-free tests. Every order afterwards is a deterministic replay; in the app the bridge replayed each command in 71–525 ms (4 commands, one automated run, `evidence/bridge-replay.json`; the 350 ms it now waits per tap so people can follow is not included).

We do not drive kiosks with per-order screenshots ("vision adapter"): that is slow, costly and gives different results each time.

## Where the ideas come from
| Tool | Idea we reimplemented (no code copied) |
|---|---|
| browser-harness (browser-use) | Agents save what they learn as reusable skills; self-repair during learning |
| jev-browser | Turn the screen's clickable elements into a candidate list and choose among them; do not act when unsure |
| dev-browser, Aside | Read the accessibility tree → act → verify, in a persistent browser |

In the product, the learner uses Gemini. During development we also run it on OpenAI models to iterate cheaply; numbers shown publicly are re-measured with Gemini.

## How it finds things to tap (`spikes/kibo-learn/driver.mjs`)
Real kiosks are full of clickable `<div>` tiles with no accessibility role, and their text merges in the accessibility tree ("Cola2,000 won Zero cola2,000 won"). The driver therefore:
1. Gives the model the accessibility tree, any `alert()` text, and a list of **tappable labels**.
2. Finds clickable elements: visible, and with `cursor: pointer`, an `onclick` handler, or a native control tag; only the outermost clickable is kept.
3. Names each one by its **most prominent text** (largest font, bold preferred, prices ignored), falling back to `aria-label`, `title`, or the symbol itself for icon-only controls. This skips emoji lines and "NEW" badges.
4. Acts by label (exact match), by role + name, or by text as a last resort. If a label matches two elements, the step fails instead of tapping the wrong one.

jev-browser could not see the `div` tiles of our test kiosk at all (`NO_MATCH`), which is why this matters.

## Skill format
```json
{
  "kiosk": "…", "categories": ["…"], "uiLabels": ["order", "clear all"],
  "dineOptions": {"eat_in": "<label>", "take_out": "<label>"},
  "catalog": [{"name": "…", "category": "…", "price": 0, "soldOut": false, "recipe": "addToCart",
               "optionGroups": [{"name": "…", "required": true, "min": 1, "max": 1,
                                 "options": [{"name": "…", "priceDelta": 0}]}]}],
  "recipes": {"startOrder": [ {"op": "click", "label": "{dineOption}"} ],
              "addToCart": [ {"op": "click", "label": "{category}"}, {"op": "click", "label": "{item}"},
                             {"op": "forEach", "over": "options", "as": "option",
                              "steps": [{"op": "click", "label": "{option}"}]},
                             {"op": "repeat", "times": "{qtyMinus1}", "steps": [{"op": "click", "label": "+"}]} ]},
  "cartTotalPattern": "<regex whose group 1 is the total>"
}
```
Since 13-blind-kiosks:4 (`spikes/kibo-learn/CHANGES.md`): a step may carry `"within": "<text>"` (the match nearest that text, e.g. the `+` in the shot's own row); the op `chooseOptions` runs, per option group, the group's own `select` steps for each chosen option and then its `after` steps (a wizard's `다음`); a group may be `"type": "quantity"` (options with `maxQty`, an order repeats the name per count) or carry `"appliesWhen": "<group>=<option>"`; `forbiddenLabels` lists checkout and payment buttons. The product bridge replays `within`, `chooseOptions`, `select` and `after` the same way. Since round 3 (`spikes/blind-kiosks/ROUND3.md`, learner only, not in the product bridge yet): optional `interrupts` (a popup's text and the step that dismisses it; the runner answers them before each step and after a failed step, then retries it once), `review` (the steps that open the kiosk's order review with the one allowed `openReview` tap on its order button, and the pattern for the total shown there) and `charges` (amounts the review adds per order); the finish gate needs every option group used by a passing self-test, and an order passes only when the skill's total equals the kiosk's. Since round 4 (`spikes/blind-kiosks/ROUND4.md`, learner only): a `chooseOptions` step may name `groups` and runs only those where it stands (a set popup after the add button), a conditional group the line does not use is skipped with its `after` steps, and `declines` names a popup button the skill always taps to decline an offer (orders that want the offer are refused); while learning, the model may write `sharedGroups` and send `skillPatch` instead of the whole skill, and `skill.json` is always written resolved.

## Learning loop (`learner.mjs`)
Tools: `snapshot`, `act`, `reload`, `record` / `records` (findings survive memory pruning), `testSkill`, `audit`, `finish`.
- Only the last 4 screens stay in the model's context; findings are kept with `record`.
- A per-run input-token cap stops runaway cost.
- **`finish` is accepted only if** the exact skill passed `testSkill` on ≥ 3 orders **and** passed the coverage audit. Since 13-blind-kiosks:4 the orders may come from several `testSkill` calls of the same exact skill (none failing), and a skill lint must pass (no navigation or stepper buttons as options, quantity groups with `select`, valid `appliesWhen`, no payment control in a recipe).
- Payment and checkout controls are never tapped while learning or replaying (13-blind-kiosks:4).
- Since round 4 the option-name lint takes numbers and one-word choices as names (`0%`, `2`, `곱빼기`; it refused them before, I-300), refuses a recipe step that taps an option name, and the gate stops asking for `review` on a device whose order button sends the order (I-303).

## Coverage audit (`audit.mjs`, no AI)
Starts an order with the skill's own recipe, opens every category (following pager arrows), and checks:
- every **priced tile** is in the catalog (a tile counts if its label or any line of its text is a catalog name, because sold-out overlays are often the biggest text);
- every other tappable label is a known category or a declared control (`uiLabels`);
- each declared control is clicked on a fresh page; priced tiles appearing behind it mean a **hidden category**.

Since round 4 it also opens every orderable item (choices on its first screen now include plain look-alike buttons in a row, not only radios, checkboxes and "+n원" labels) and replays the simplest line of each kind of item, and it **fails** when a recipe step written with a fixed label taps one of several look-alike choices (always on the item's screen; on a popup after it when the popup shows prices and the skill does not declare it in `declines`) or when the kiosk does not add an item while the skill leaves out a choice its screen shows (I-301). A tappable whose amounts are all 0 (a running total) is a control, not a missing item (I-302). What it saw is kept for the rest of the run, so a repeated audit of the same skill opens nothing again.

Regression test (`test_audit.mjs`, 4/4): complete skills pass; a skill missing three categories is rejected; a category disguised as a "control" is caught.

## Watching a run (`/learn`)
Learning runs offline (a browser and Gemini, minutes per run), so the product shows replays of real recorded runs, never a live or made-up one. With `TRACE_DIR` the learner writes one screenshot and one JSON line per turn; `npm run learn:runs` (`scripts/learn-runs.ts`) copies them to `public/learn/<runId>/` unchanged except for the image format (WebP ≤ 60 KB, ≤ 5 MB per run). `/learn/<runId>` steps through every turn: the screenshot, the action in plain words, the counts the learner had written down, and milestones (first items, all categories, coverage audit, self-test, finish). It plays by itself at 4× with a visible Pause, and Korean labels show their English from a static glossary of the runs' own labels (`src/lib/learn/glossary.ts`; a test fails when a run shows a label the glossary lacks). The trace records which label was tapped but not where, so the replay draws no tap mark (I-266). Shown, in this order: the `bk9-bunsik` final run (14-final:7: round 4, a snack bar kiosk never seen before its run, learner frozen first; 9.6 min, 10 of 10 correct, the skill's own total matched the kiosk's in all 10), the `bk6-themepark` final run (13-blind-kiosks:10: the fresh hold-out kiosk with unsafe 0 and 10 of 10 correct under grader v2, never seen before its run; its card also says the skill's own total was wrong in 4 of the 10, I-197), the `bk4-airport-shop` final run (13-blind-kiosks:9: the best final of the first four with unsafe 0; `bk3-ramen` ties at 10/0/0) and the traced Doughhouse run of the improved learner (`spikes/blind-kiosks/results/dev/gemini-doughhouse-after/`). The airport shop is not a first sighting: the learner was improved from its baseline run's failure patterns (`spikes/blind-kiosks/PROTOCOL.md`); the page says so. Both blind cards take their order numbers from `grade-v2.json`.

## Runtime
Tool call → arguments validated against the skill catalog → the in-page bridge replays the recipe → the kiosk's own total **and** cart lines are checked → session updated. On mismatch: stop, re-read the kiosk cart, offer staff or touch. No self-healing at runtime.

A skill depends on the kiosk's labels, roles and cart text, not its look. The Doughhouse page was restyled on 10-14 (14-final:2) with CSS only; `spikes/kibo-learn/restyle.test.mjs` shows the labels, accessibility tree and cart text are unchanged on every screen, and the run 3 skill still replays its holdout 4/4 (`results/run3/holdout.restyled.log`). A change to a label would need re-learning (gap 8 below). The `/learn` Doughhouse trace was recorded on 10-13, before the restyle, so its pictures show the plain page; it was not re-recorded, and the card says so.

**Seeing the replay (14-final:3).** On `/learned/<kiosk>` and `/demo?k=doughhouse` the bridge hands each click it is about to make (label and box) to the page around the kiosk, which draws a numbered mark on the target and waits 350 ms before the click, so a person can follow; only clicks that happen are drawn. The line beside the kiosk says "✓ matches" with the kiosk's own total only after the server checked that total, otherwise that nothing was added. The page keeps the learner's 1080 width but is laid out 1120–1600 tall, so it draws ≥ 0.8× at 1440×900; its cart bar and sheets are fixed to the viewport and its labels do not depend on the height.

**Getting onto a real kiosk.** Kiosks that share menu data use a direct adapter. On a web kiosk the bridge is one script in the page: added by the vendor or store with a script tag, a kiosk-browser extension, or WebView injection. Native kiosk apps are roadmap (gap 7). In this demo the page runs inside KIBO's own page; there are no vendor partnerships.

## Results so far
**Blind kiosk test (13-blind-kiosks, 10-13 to 10-14; full tables in `spikes/blind-kiosks/RESULTS.md`).** Six synthetic kiosks built by separate AI agents, 10 holdout orders each, graded without AI by `spikes/blind-kiosks/grade/` (grader v2: kiosk total plus the item names in the kiosk's cart, opening a closed cart drawer; options are not compared). Gemini 3.8 Flash, one run per kiosk and phase. Orders are correct / safe refusal / **unsafe**.

| Kiosks | Learner | Finished | Items found | Orders | Cost | Evidence |
|---|---|---|---|---|---|---|
| bk1–bk4 (cinema, bakery, ramen, airport shop) | before the improvements (baseline) | 2 of 4 | 57/134 | 5 / 10 / **5** of 40, 20 not learned | $5.22 (cache not recorded) | `spikes/blind-kiosks/results/bk*/baseline/grade-v2.json`, `learn-stats.json` |
| bk1–bk4 | after the improvements (final) | 4 of 4 | 134/134 | 31 / 4 / **5** of 40 | $1.49 | `spikes/blind-kiosks/results/bk*/final/grade-v2.json`, `learn-stats.json` |
| bk5, bk6 (food court, theme park): **fresh hold-out**, added after the improvements, never seen | final | 2 of 2 | 56/56 | 14 / 3 / **3** of 20 | $0.84 | `spikes/blind-kiosks/results/bk{5-restarea,6-themepark}/final/grade-v2.json` |
| bk7, bk8 (bubble tea, table order): round 3 fresh | round 3 (`ea28477`) | 1 of 2 (bk8 not learned in 2 attempts) | 31/68 | 0 / 10 / 0 of 20, 10 not learned | $1.60 | `spikes/blind-kiosks/ROUND3.md`; `results/bk7-bubbletea/final/`, `results/bk8-tableorder/final-attempt2/` |
| bk9, bk10 (snack bar, chicken shop): round 4 fresh | round 4 (`a9522a4`, frozen) | 2 of 2 | 62/62 | **18 / 2 / 0** of 20 | $0.79 | `spikes/blind-kiosks/ROUND4.md`; `results/bk{9-bunsik,10-chicken}/final/grade-v2.json` |

The groups are never added into one total, except the never-seen kiosks (each new to that round's learner): 32 correct / 15 refused / 3 unsafe / 10 not learned of 60 orders over 6 kiosks. The unsafe orders: on the four test kiosks' final, 5 on the bakery, where the kiosk's own timeout modal blocked the replay (I-193; fixed in round 3, I-194); on the never-seen kiosks, 3 on the food court, the three take-out orders, 100원 below the answer key (an optional bag on the order review that the grader did not ask for, I-195, I-229). The skill's own total (what the phone would quote) differed from the kiosk's in 3 of the 31 four-kiosk final orders that reached a kiosk total, and in 6 of the 35 never-seen-kiosk orders that did (I-197). Learning cost per run: `evidence/learn-cost.json`. The first four kiosks are not a clean blind test of the final learner: it was improved from their baseline failure patterns, on the dev set only. Cost is tokens × the Gemini API price for `gemini-3.8-flash` (`evidence/cost-per-order.json`); the learner ran on Vertex AI, whose price was not read (unverified).

Earlier runs:

| Run | Model | Result |
|---|---|---|
| Doughhouse, run 3 (10-13, **with the finish gate and audit**) | Gemini 3.8 Flash | finished: 4.8 min, 63 turns, 482,553 input tokens; one self-test call of 3 orders 3/3; audit passed (0 missing, 0 unknown, 0 hidden); items, prices and options match the reviewed skill (the sold-out pizza has no options, it cannot be opened); unseen orders 4/4 + rule violation detected, 546–697 ms each (`results/run3/`) |
| Doughhouse (10 items, ours), run 2 | Gemini 3.8 Flash | 5.5 min, 636k input tokens; catalog exact; unseen orders 4/4 + rule violation detected |
| Doughhouse | gpt-6.1-sol (dev) | 3.1 min, 181k input tokens; unseen orders 4/4 + violation detected |
| Gureum Darak Coffee (40 items, blind) | Gemini 3.8 Flash ×3 | 2/3 finished; items 40/40; options 21–22/29 exact |
| Gureum Darak Coffee | gpt-6.1-sol, no audit (dev) | finished early with only 23/40 items |
| Gureum Darak Coffee | gpt-6.1-sol + audit (dev) | 16.1 min; **40/40 items**; audit passed; example orders 2/5 |
| Doughhouse | Gemini Flash-Lite / gpt-6-luna | failed or shallow; not suitable |

Only run 3 includes the ≥ 3 self-test finish gate and the coverage audit (`spikes/kibo-learn/results/run3/learn-stats.json`, `learn.log`). The other Gemini runs above were made before both existed (`stats.run2.json` records 2 tests). The blind Gureum Darak Coffee kiosk has not been re-run with Gemini under the gate.

Evidence files are listed in `docs/TESTING.md`.

## Known gaps (next)
13-blind-kiosks:4 added a way to express items 1–3 and checks for them (quantity groups, the lint, `appliesWhen`, `chooseOptions`). On the blind finals (`spikes/blind-kiosks/RESULTS.md`) quantity groups were learned 18 of 20 on bk1–bk4 and 7 of 7 on bk6; conditional groups 16 of 19 on bk2 but 0 of 4 on bk1 and bk6.
1. **Quantity options** (extra shot "− 1 +"): expressible as `"type": "quantity"`; the product cart cannot order a count on a learned kiosk yet (I-190).
2. **Navigation recorded as options** ("Next" in multi-step sets): the skill lint rejects navigation words and bare symbols as option names; wizard steps go in a group's `after`.
3. **Conditional groups** (ice amount appears only for iced drinks): recorded with `appliesWhen`; the audit only sees each item's first screen, so it cannot point out a missed conditional group.
4. **Interruptions in the middle of an order**: a kiosk's timeout modal that comes up between two steps stops the replay (I-194, the remaining bakery unsafe orders); a skill can only answer it at the start of a recipe.
5. **Prices the skill predicts**: a discount per person recorded as one amount per line (bk6) and charges added only after the checkout button (bk5's take-out, I-195) make the skill's total differ from the kiosk's; the gate does not ask for self-tests that cover every option group (I-192, I-197).
6. **Names typed by the learner**: an option named `곱배기` while the kiosk shows `곱빼기` blocks those orders (I-196). Round 4 found the cause: the lint refused `곱빼기` as a stepper word, so the learner renamed it (I-300, fixed; bk5 not re-run). Upsell acceptance is not recorded (bk1).
7. Scope: web and webview kiosks. Native apps via OS accessibility APIs are roadmap.
8. Skills are tied to the driver's labelling rules; record the driver version and re-learn when it changes.
