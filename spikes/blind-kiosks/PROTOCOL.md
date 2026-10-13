# Blind kiosk test protocol (KIBO Learn generalization)

Goal: measure how well KIBO Learn learns **kiosks it has never seen**, with a protocol a judge would accept as fair, and improve the learner without fitting it to the test kiosks.

## Roles and separation
| Role | Who | May read | Must not read |
|---|---|---|---|
| Builder | one independent agent per kiosk, started with only its brief | its brief, this protocol's "Builder rules" and "Answer key schema" | `spikes/kibo-learn/`, `docs/KIBO_LEARN.md`, `spikes/blind-kiosk/app/`, other builders' kiosks, any learner output |
| Learner | `spikes/kibo-learn/learner.mjs` with Gemini (`gemini-3.8-flash`) | the kiosk's URL only (`KIOSK_URL`) | the answer key, the brief |
| Grader | scripts with no AI (`spikes/blind-kiosks/grade/`) | learner output + answer key | — |
| Developer (learner improvements) | harness steps | the **dev set** only: Doughhouse (`spikes/kibo-learn/kiosk/`) and Gureum Darak Coffee (`spikes/blind-kiosk/`) | the four new kiosks' apps and answer keys, until the final run |

The four new kiosks are the **held-out test set**. They are learned twice: once with the current learner (baseline), once after the improvements (final). Nothing about them is used to change the learner in between.

## The four kiosks
| Id | Domain | Size | Patterns it must contain (each builder gets only its own row) |
|---|---|---|---|
| `bk1-cinema` | Cinema snack bar (팝콘·음료·콤보) | 25–35 items, 5–6 categories | combo builder wizard with "다음/이전" steps; size required on popcorn; half-and-half flavor pick (exactly 2); paged menu grid (pager arrows); icon-only category tabs with `aria-label`; upsell popup after combos |
| `bk2-bakery` | Bakery café (커피·음료·빵) | 35–45 items, 6–7 categories | hot/iced required; **conditional group** (ice amount only for iced); **quantity stepper option** (extra shot "− 0 +", max 3, +500 each); syrup multi-select max 2; temperature-dependent price; 3 sold-out items; "처음으로" timeout warning modal |
| `bk3-ramen` | Ramen shop meal-ticket machine (식권 발매기) | 20–30 items, 4–5 categories | one big grid with category filter chips; noodle firmness required radio; toppings each with their own quantity (0–3); set menus (ramen + side + drink) as a 3-step modal; native `alert()` for errors; cart quantity edit inside the cart list |
| `bk4-airport-shop` | Airport convenience store / grab-and-go (편의점) | 30–40 items, 5–6 categories | Korean/English toggle on the start screen; age-restricted item that asks a yes/no confirm; "1+1" promotion items that auto-add a free line; cart as a slide-in drawer; quantity stepper on tiles; sold-out and "time-limited" items |

## Builder rules (given to every builder)
1. Build a **static, self-contained web app** (`app/index.html` + JS + CSS, no network, no build step, no external fonts or CDNs, no frameworks required) that behaves like a real self-order kiosk in Korea: attract screen → (dine/takeout or the domain's equivalent) → menu → item options → cart → order review → payment-method screen (stop there; no real payment).
2. **Fictional** brand, items and wording. No real brands, chains, logos, products, character names or store photos. Item pictures: simple CSS shapes, emoji are allowed **inside the kiosk only** (they are part of the "black box"), or no images.
3. Realistic markup: mix real `<button>`s with clickable `<div>`s; some text merges in the DOM like real kiosks; at least one popup, one confirmation, one error message; prices shown as "4,500원".
4. Deterministic: no random behavior, no clocks that change behavior during a run except what the brief asks (time-limited items must use a fixed fake clock you document).
5. Write `answer-key.json` (schema below) that matches the app exactly, and 10 **holdout orders** covering the patterns, each with the expected kiosk total. Write `BRIEF.md` (what you built, the patterns, any quirks). Do not describe how an AI should learn it.
6. Self-check: open the app with Playwright (`npx playwright` is available in the repo, or `node` + `playwright-core` with the installed Chrome) and place 3 of the holdout orders by hand-written scripts to prove the totals match the answer key. Keep the script in `selfcheck/`.

## Answer key schema
```json
{
  "kiosk": { "name": "…", "nameEn": "…", "domain": "…" },
  "flow": ["short description of each screen in order"],
  "categories": [{ "label": "…", "itemCount": 0 }],
  "optionGroups": { "<groupId>": { "title": "…", "type": "single|multi|quantity", "required": true, "min": 1, "max": 1, "default": "<optionId>|null", "appliesWhen": "<condition or null>", "options": [{ "id": "…", "label": "…", "priceDelta": 0, "maxQty": 0 }] } },
  "items": [{ "name": "…", "category": "…", "basePrice": 0, "soldOut": false, "timeLimited": null, "optionGroups": ["<groupId>"] }],
  "promotions": [{ "rule": "…", "effect": "…" }],
  "holdoutOrders": [{ "id": "h1", "lines": [{ "item": "…", "options": { "<groupId>": ["<optionId>"] }, "qty": 1 }], "expectedTotal": 0, "patterns": ["…"] }],
  "quirks": ["anything a careful human would notice"]
}
```

## Metrics (grader, no AI)
- **Learning:** finished through the gate (≥ 3 self-tests + coverage audit), minutes, turns, input/output tokens.
- **Catalog:** item recall and precision by name; price accuracy; category accuracy; sold-out accuracy; option groups per item exact (labels + deltas), min/max/required correct, conditional groups captured.
- **Orders (the number that matters):** each holdout order is replayed by the AI-free runner. Outcomes: **correct** (kiosk total and lines match), **safe refusal** (refused before any click because the skill cannot express it), **unsafe** (clicked and the kiosk cart is wrong, or a forbidden label was approached). Report all three; unsafe must be 0 to call a kiosk supported.
- Cost from the token counts and the official price (evidence file of the day).

## Runs and reporting
- Baseline: current learner, one run per kiosk, token cap 2M input.
- Improvements: only on the dev set (above), with regression tests.
- Final: improved learner, one run per kiosk, same cap. No reruns to "get a better number"; a crash is rerun once and reported.
- `spikes/blind-kiosks/RESULTS.md`: a table per kiosk (baseline vs final) and the totals; links to every log; limits stated plainly. Numbers go to `docs/TESTING.md` and `docs/KIBO_LEARN.md` only from these files (R-001).
