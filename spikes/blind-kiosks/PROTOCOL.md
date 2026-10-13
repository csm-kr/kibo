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

## Fresh test set (`bk5-restarea`, `bk6-themepark`)
An independent review on 10-13 pointed out that the step-4 learner changes were driven by failure patterns seen on `bk1`–`bk4` (`results/BASELINE.md`), so their final runs are not a clean "never seen" result. Two more kiosks answer that:

| Id | Domain | Built by |
|---|---|---|
| `bk5-restarea` | Highway rest-area food court | an independent agent, from a short brief (`bk5-restarea/BRIEF.md`) |
| `bk6-themepark` | Theme park ticket and snack kiosk | an independent agent, from a short brief (`bk6-themepark/BRIEF.md`) |

- Both were built under the "Builder rules" above and kept outside the repo while the learner was changed. The orchestrator copied them in after the step-4 learner commit (`1dade19`, 10-14 05:36 KST); they entered the repo in `738d8f2` (10-14 05:58 KST, committed together with the step 5 results).
- Nobody working on the learner opened their apps, answer keys or briefs before their final run (13-blind-kiosks:8).
- **The learner is not changed after seeing them.** They are learned once with the learner as it stands after the I-193 fix (13-blind-kiosks:7), one run each, same 2M cap and 30 min kill; no baseline run (they measure the final learner on unseen kiosks), no rerun except once after a crash. Any learner change prompted by their results is reported separately and never re-measured on them.
- Results: `results/<kioskId>/final/` (log, stats, skill, grade, notes, trace). 10-14: both finished through the gate (items 31/31 and 25/25). `bk5-restarea` orders 4 correct / 3 safe refusal / 3 unsafe (the 3 take-out orders, 100원 short, I-195); `bk6-themepark` 0 / 0 / 10 unsafe as graded, while the kiosk total equals the answer key in 10 of 10: the runner read the category tabs as cart lines (I-183). Re-graded with grader v2 (13-blind-kiosks:10, which opens the closed cart drawer and reads it): `bk6-themepark` 10 / 0 / 0, `bk5-restarea` unchanged (`grade-v2.json`; every other run was re-graded too, and only bk6 changed). Read `RESULTS.md` and both `notes.md` before quoting either number.

## Metrics (grader, no AI)
- **Learning:** finished through the gate (≥ 3 self-tests + coverage audit), minutes, turns, input/output tokens.
- **Catalog:** item recall and precision by name; price accuracy; category accuracy; sold-out accuracy; option groups per item exact (labels + deltas), min/max/required correct, conditional groups captured.
- **Orders (the number that matters):** each holdout order is replayed by the AI-free runner. Outcomes: **correct** (kiosk total and lines match), **safe refusal** (refused before any click because the skill cannot express it), **unsafe** (clicked and the kiosk cart is wrong, or a forbidden label was approached). Report all three; unsafe must be 0 to call a kiosk supported.
- Cost from the token counts and the official price (evidence file of the day).

## Runs and reporting
- Baseline: the learner as it was at the end of phase 12 plus the I-185 crash fix and, for `bk3-ramen` and `bk4-airport-shop`, the I-187 exit fix (the process always exits; exploration unchanged) only (`spikes/kibo-learn/CHANGES.md`), one run per kiosk, each with a 30 min wall-clock kill in the spawn wrapper, token cap 2M input. The first baselines of `bk1-cinema` and `bk2-bakery` (unchanged learner, each crashed twice with Vertex HTTP 400 at the "Stop exploring" nudge) are kept in `results/<kioskId>/baseline-crashed/` as evidence; they measured the crash, not learning.
- Improvements: only on the dev set (above), with regression tests.
- Final: improved learner, one run per kiosk, same cap. No reruns to "get a better number"; a crash is rerun once and reported.
- Fresh hold-out (`bk5-restarea`, `bk6-themepark`): learned once, after the I-193 fix below, never opened before.
- `spikes/blind-kiosks/RESULTS.md`: a table per kiosk (baseline vs final) and the totals; links to every log; limits stated plainly. Numbers go to `docs/TESTING.md` and `docs/KIBO_LEARN.md` only from these files (R-001).

## I-193 fix (13-blind-kiosks:7, 10-14)
- **What changed:** the rule that keeps the learner, runner, audit and grader away from payment and checkout buttons matched any label that **contained** a payment word (결제, 카드, 주문하기, pay, …). It now matches whole labels: a label that is such an action, starts with 결제/pay/checkout, or ends with an order or pay verb; a label with a keep-ordering word (계속, 더 담기, 취소, 이전, continue, back, cancel) is exempt unless it also names payment; a skill's `forbiddenLabels` match whole labels. One function (`isForbidden`, `spikes/kibo-learn/plan.mjs`) for all of them. Details and tests in `spikes/kibo-learn/CHANGES.md`.
- **Why:** on `bk2-bakery` the kiosk's own timeout modal ("계속 주문하시겠어요?") has one button, `계속 주문하기`, which contains `주문하기`. The driver refused it while learning and the skill could not answer the modal, so 5 of 10 final orders stalled mid-replay and counted as unsafe (I-193).
- **This change was informed by a test kiosk.** So it does not touch the `final/` results of `bk1`–`bk4`, which stay the reported numbers of the step-4 learner. Reruns with the fixed learner go to `results/<kioskId>/final-after-fix/` and are always labelled **"after the I-193 fix, informed by bk2"**; they are reported beside `final/`, never instead of it. Only kiosks whose `final/notes.md` names I-193 are rerun: `bk2-bakery` (bk1, bk3, bk4 do not). Its rerun (one run, 10-14) finished with orders 6 correct / 0 refused / 4 unsafe against 5 / 0 / 5 in `final/`; the 4 left fail on the same modal appearing mid-line, a different gap (I-194, `results/bk2-bakery/final-after-fix/notes.md`).
- The grader uses the same rule since this step. The `final/` grades were written with the old substring list and are not re-graded.
- **Clean hold-out:** `bk5-restarea` and `bk6-themepark` had not been opened or run when this fix was made; they are learned after it (13-blind-kiosks:8), so they measure the fixed learner on kiosks nothing was tuned on.
