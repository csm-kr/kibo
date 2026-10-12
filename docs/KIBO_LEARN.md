# KIBO Learn

**Learn a kiosk once, turn it into a skill, replay orders without AI.** For kiosks that offer no integration, an agent explores the kiosk's web UI, writes a skill (catalog + click recipes), and proves it with AI-free tests. Every order afterwards is a deterministic replay; in our test it took 0.7–5.2 s per order (4 orders, `spikes/kibo-learn/results/holdout.run2.log`).

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

## Learning loop (`learner.mjs`)
Tools: `snapshot`, `act`, `reload`, `record` / `records` (findings survive memory pruning), `testSkill`, `audit`, `finish`.
- Only the last 4 screens stay in the model's context; findings are kept with `record`.
- A per-run input-token cap stops runaway cost.
- **`finish` is accepted only if** the exact skill passed `testSkill` on ≥ 3 orders **and** passed the coverage audit.

## Coverage audit (`audit.mjs`, no AI)
Starts an order with the skill's own recipe, opens every category (following pager arrows), and checks:
- every **priced tile** is in the catalog (a tile counts if its label or any line of its text is a catalog name, because sold-out overlays are often the biggest text);
- every other tappable label is a known category or a declared control (`uiLabels`);
- each declared control is clicked on a fresh page; priced tiles appearing behind it mean a **hidden category**.

Regression test (`test_audit.mjs`, 4/4): complete skills pass; a skill missing three categories is rejected; a category disguised as a "control" is caught.

## Runtime
Tool call → arguments validated against the skill catalog → the in-page bridge replays the recipe → the kiosk's own total **and** cart lines are checked → session updated. On mismatch: stop, re-read the kiosk cart, offer staff or touch. No self-healing at runtime.

## Results so far
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
1. **Quantity options** (extra shot "− 1 +") are not modelled; recorded as a "+" option.
2. **Navigation recorded as options** ("Next" in multi-step sets). Recipes must handle navigation; options must be customer choices only. Add a lint that rejects navigation words and bare symbols as option names.
3. **Conditional groups** (ice amount appears only for iced drinks) are missed.
4. Scope: web and webview kiosks. Native apps via OS accessibility APIs are roadmap.
5. Skills are tied to the driver's labelling rules; record the driver version and re-learn when it changes.
