# Blind kiosk test: results (13-blind-kiosks, 10-13 to 10-14)

## Protocol in three sentences
Six synthetic kiosks were built by separate AI agents from short briefs, each with an answer key and 10 holdout orders that nobody working on the learner read (`PROTOCOL.md`). KIBO Learn (`spikes/kibo-learn/learner.mjs`, Gemini `gemini-3.8-flash` on Vertex AI, 2M input-token cap) learned the first four once before and once after the learner was improved on a separate dev set; the last two (fresh hold-out) were added only after the improvements and learned once. An AI-free grader (`grade/`) scores the learned catalog against the answer key and replays every holdout order without AI: **correct** (the kiosk's own total equals the key and every item is in the kiosk's cart), **safe refusal** (refused before any tap because the skill cannot express it), **unsafe** (anything was tapped and the result is wrong, or a step failed mid-order).

## How to read the numbers
- **Grader v2 (this step, I-183).** Grader v1 read "cart lines" from list items in the page's accessibility tree; no kiosk's cart was a list, and on `bk6-themepark` the category tabs were, so v1 compared item names with the tabs and graded all 10 orders unsafe while the kiosk total matched in 10 of 10. v2 reads the kiosk's cart panel (a visible element headed 장바구니, 주문 내역, Cart …) and, when the cart is a closed drawer, taps the kiosk's own cart button first (never a payment control). Tested on a drawer fixture (`grade/test/cart.test.mjs`, `grade/test/fixtures/drawer/`). Every run below was re-graded into `grade-v2.json` next to its `grade.json` (kept). **Only `bk6-themepark` changed**: 0 / 0 / 10 → 10 / 0 / 0. Everywhere else the outcomes are the same and v2 now reads the cart in every correct order (v1: in none).
- **Cart check compares item names only.** Options are not compared (the cart shows them, the grader does not read them), so a wrong 0원 choice (noodle firmness, a sauce) can still count as correct; `totalCannotSee` in each `grade-v2.json` lists those choices per order.
- **Skill total wrong** (counted over the orders that reached a kiosk total; an order whose step failed has none). The skill's own predicted total (what a phone would quote before the kiosk) is compared with the kiosk's (`skillPredicts` vs `kioskTotal`). In the product a mismatch is caught by the bridge, which applies nothing and calls staff (`docs/ARCHITECTURE.md` `bridgeReport`), so it is a failed order, not a wrong one; it is shown as its own column because it is not counted in "correct / refused / unsafe".
- **Cost** = tokens × the official Gemini API paid-tier price for `gemini-3.8-flash` in `evidence/cost-per-order.json` (`prices`: input $0.75, cached input $0.075, output $3.75 per 1M; read 10-13). The learner runs on Vertex AI, whose price for this model was not read (unverified). The baseline learner did not record cached tokens (`cachedInputTokens` 0), so baseline costs assume nothing was cached (an upper bound).

## The four test kiosks: baseline → final
Orders are correct / safe refusal / **unsafe** / not learned, of 10, from `grade-v2.json` (identical to `grade.json` for these runs).

### bk1-cinema (cinema snack bar, 32 items)
| | Baseline | Final |
|---|---|---|
| Finished through the gate | yes | yes |
| Minutes, turns | 7.4, 109 | 13.3, 94 |
| Input tokens (cached), output | 1,068,732 (not recorded), 22,840 | 977,691 (609,457), 29,088 |
| Cost | $0.89 | $0.43 |
| Items found, price right | 32/32, 32/32 | 32/32, 31/32 |
| Option groups exact (items with all options exact) | 19/25 | 18/25 |
| Quantity groups, conditional groups | 0/3, 0/4 | 2/3, 0/4 |
| Orders | 3 / 4 / **3** / 0 | 6 / 4 / **0** / 0 |
| Skill total wrong (of orders with a kiosk total) | 0 of 3 | 1 of 6 (h10) |
| Files | [`baseline/`](results/bk1-cinema/baseline/) `learn-stats.json`, `grade-v2.json` | [`final/`](results/bk1-cinema/final/) `learn-stats.json`, `grade-v2.json` |

Baseline unsafe: a quantity `+` that matched 2–3 buttons (h3, h4, h6). Final refusals: the skill has no way to accept the combo upsell (h2, h5, h8) and lacks the slush flavor 딸기 (h6).

### bk2-bakery (bakery café, 40 items)
| | Baseline | Final | Final, after the I-193 fix (labelled rerun, see below) |
|---|---|---|---|
| Finished through the gate | no (2M token cap, turn 77) | yes | yes |
| Minutes, turns | 10.3, 77 | 11.8, 86 | 16.8, 108 |
| Input tokens (cached), output | 2,007,149 (not recorded), 6,357 | 693,862 (276,042), 52,330 | 1,867,350 (1,320,614), 87,144 |
| Cost | $1.53 | $0.53 | $0.84 |
| Items found, price right | 0/40, — | 40/40, 34/40 | 40/40, 37/40 |
| Option groups exact | — | 22/27 | 25/27 |
| Quantity groups, conditional groups | — | 7/7, 16/19 | 7/7, 15/19 |
| Orders | 0 / 0 / 0 / 10 | 5 / 0 / **5** / 0 | 6 / 0 / **4** / 0 |
| Skill total wrong (of orders with a kiosk total) | — | 2 of 5 (h4, h6) | 1 of 6 (h6) |
| Files | [`baseline/`](results/bk2-bakery/baseline/) | [`final/`](results/bk2-bakery/final/) | [`final-after-fix/`](results/bk2-bakery/final-after-fix/) |

Final unsafe (h1, h5, h8, h9, h10): the kiosk's "계속 주문하시겠어요?" timeout modal covered the next tap, and the learner was not allowed to tap its `계속 주문하기` button because it contains `주문하기` (I-193). After that fix 4 are still unsafe (h1, h5, h9, h10): the modal now comes up in the middle of a line, where the skill does not answer it (I-194, open). The rerun is labelled **"after the I-193 fix, informed by bk2"**; it does not replace the final number (`PROTOCOL.md` "I-193 fix").

### bk3-ramen (ramen meal-ticket machine, 25 items)
| | Baseline | Final |
|---|---|---|
| Finished through the gate | yes | yes |
| Minutes, turns | 20.6, 95 | 8.0, 46 |
| Input tokens (cached), output | 1,582,965 (not recorded), 20,044 | 437,774 (227,679), 19,472 |
| Cost | $1.26 | $0.25 |
| Items found, price right | 25/25, 25/25 | 25/25, 25/25 |
| Option groups exact | 4/14 | 13/14 |
| Quantity groups (toppings) | 0/8 | 7/8 |
| Orders | 2 / 6 / **2** / 0 | 10 / 0 / **0** / 0 |
| Skill total wrong (of orders with a kiosk total) | 0 of 2 | 0 of 10 |
| Files | [`baseline/`](results/bk3-ramen/baseline/) | [`final/`](results/bk3-ramen/final/) |

Baseline unsafe: the cart's `수량 더하기` matched 2–3 buttons (h4, h9); refusals: toppings and set choices not in the skill.

### bk4-airport-shop (airport convenience store, 37 items)
| | Baseline | Final |
|---|---|---|
| Finished through the gate | no (2M token cap, turn 113; a first try stopped on an expired token, I-188) | yes |
| Minutes, turns | 11.1, 113 | 8.1, 64 |
| Input tokens (cached), output | 2,002,024 (not recorded), 9,479 | 666,077 (394,579), 13,569 |
| Cost | $1.54 | $0.28 |
| Items found, price right | 0/37, — | 37/37, 37/37 |
| Option groups exact | — | 12/12 |
| Quantity groups (extra shot) | — | 2/2 |
| Orders | 0 / 0 / 0 / 10 | 10 / 0 / **0** / 0 |
| Skill total wrong (of orders with a kiosk total) | — | 0 of 10 |
| Files | [`baseline/`](results/bk4-airport-shop/baseline/) | [`final/`](results/bk4-airport-shop/final/) |

### Totals, four test kiosks (40 holdout orders)
| | Baseline | Final |
|---|---|---|
| Finished through the gate | 2 of 4 | 4 of 4 |
| Items found | 57 of 134 | 134 of 134 |
| Prices right (of items found) | 57 of 57 | 127 of 134 |
| Orders correct / safe refusal / **unsafe** / not learned | 5 / 10 / **5** / 20 | 31 / 4 / **5** / 0 |
| Learning time, all four | 49.4 min | 41.2 min |
| Cost, all four | $5.22 (upper bound, cache not recorded) | $1.49 |

Sums of the per-kiosk rows above. With the bk2 rerun in place of bk2's final, the final orders would read 32 / 4 / 4; that rerun was informed by bk2, so it is not the reported number.

## Fresh hold-out: bk5-restarea and bk6-themepark
Built by separate AI agents and copied into the repo only after the learner improvements (commit `738d8f2`, after the learner commit `1dade19`); nobody working on the learner opened them before their run, and the learner was not changed after seeing them (`PROTOCOL.md` "Fresh test set"). One run each, no baseline, no rerun. **This is the cleanest "never seen" result.**

| | bk5-restarea (highway food court) | bk6-themepark (theme park tickets and snacks) |
|---|---|---|
| Finished through the gate | yes | yes |
| Minutes, turns | 13.5, 89 | 12.7, 87 |
| Input tokens (cached), output | 843,596 (556,135), 24,362 | 1,284,672 (862,085), 28,615 |
| Cost | $0.35 | $0.49 |
| Items found, price right | 31/31, 31/31 | 25/25, 18/25 |
| Option groups exact | 4/10 | 10/18 |
| Quantity groups, conditional groups | —, — | 7/7, 0/4 |
| Orders, grader v1 (`grade.json`) | 4 / 3 / **3** / 0 | 0 / 0 / **10** / 0 |
| **Orders, grader v2 (`grade-v2.json`)** | **4 / 3 / 3 / 0** | **10 / 0 / 0 / 0** |
| Skill total wrong (of orders with a kiosk total) | 0 of 7 | **4 of 10** (h2, h3, h9, h10) |
| Files | [`final/`](results/bk5-restarea/final/) `notes.md` | [`final/`](results/bk6-themepark/final/) `notes.md` |

Both together, grader v2: **14 correct, 3 safe refusals, 3 unsafe of 20**; items 56 of 56; $0.84.

- **bk5 unsafe (h3, h4, h9)** are exactly the three take-out orders: the kiosk total is 100원 below the answer key each time. The menu screen's cart shows no take-out charge, so it is most likely added after `주문하기`, a screen the learner and the bridge never open (I-195, unverified). Refusals (h1, h6, h7): the skill names an option `곱배기` while the kiosk's label is `곱빼기` (I-196).
- **bk6 orders** all reached the right kiosk total and the right items in the cart drawer, but the skill's own total is wrong in 4 of 10 (I-197). In h2 and h3 the skill takes a ticket discount (장애인 우대 −10,000, 경로 우대 −8,000) once per line, while the answer key applies it per person (`optionGroups.discount.appliesWhen`: "priceDelta is per person"); h9 and h10 differ for reasons not traced. Its self-tests (3/3) never used those cases. On a phone this skill would quote a price the kiosk then contradicts (the product's bridge would stop and call staff).

## What improved and what did not
Improved (four test kiosks, baseline → final):
- All four now finish through the gate (2 of 4), with fewer tokens and a third of the cost ($5.22 → $1.49): records of several findings per turn, pruning and implicit caching (`spikes/kibo-learn/CHANGES.md`).
- Correct orders 5 → 31 of 40, and on the fresh pair 14 of 20. bk3 and bk4 went 2 → 10 and 0 → 10.
- Quantity steppers (toppings, extra shots, passenger counts) are learned as quantity groups: 0 of 11 on the two kiosks the baseline finished → 18 of 20 on all four, 7 of 7 on bk6.
- The baseline's unsafe orders (an ambiguous `+` matched several buttons) are gone: the driver now refuses an ambiguous label before tapping.

Not improved, or new:
- **Unsafe is 5 of 40 in the finals, the same count as the baseline**, now all on bk2's timeout modal (I-193, then I-194 after its fix). The fresh pair adds 3 (bk5 take-out charge, I-195). Total unsafe in the six finals: **8 of 60**.
- Conditional option groups: bk1 0/4 before and after, bk6 0/4 (bk2 16/19 is the exception).
- The skill's own total is wrong on some orders the kiosk got right: 7 of the 48 final orders that reached a kiosk total (bk1 1, bk2 2, bk6 4) (I-197). The gate does not ask for self-tests that cover every option group (I-192).
- Upsell acceptance is not recorded (bk1, 3 refusals); a misspelled option name blocks orders (bk5, 3 refusals).
- Learning took longer on bk1 (7.4 → 13.3 min).

## Limits
- Synthetic kiosks built by AI agents from briefs, not real store kiosks; web pages only (native kiosk apps are out of scope).
- One run per kiosk and phase, Gemini `gemini-3.8-flash` on 10-13 and 10-14; no variance measured.
- The first four kiosks are not a clean blind result for the final: the learner was improved from their baseline failure patterns (`results/BASELINE.md`), on the dev set only. Only bk5 and bk6 are unseen by the learner's developers.
- Orders are judged by the kiosk's total and the item names in its cart; options are not compared, and the kiosk's review and payment screens are never opened (bk5's take-out charge is invisible before them).
- The bk2 rerun after the I-193 fix was informed by a test kiosk and is reported beside, never instead of, bk2's final.
- No skill from these kiosks is in the product: bk6 (the only fresh one with unsafe 0) gets discounted ticket totals wrong (I-197) and orders passenger counts, which the product cart cannot express on a learned kiosk yet (I-190).
