# Blind kiosk grader

AI-free grader for the blind kiosk test (`../PROTOCOL.md` "Metrics"). It reads a learned skill and a kiosk's answer key, scores the catalog, replays the answer key's holdout orders with the kibo-learn runner (`spikes/kibo-learn/runner.mjs`, no AI) and writes one JSON file.

```bash
npm run grade:blind -- <kioskId> <path/to/skill.json> [--label <name>] [--key <answer-key.json>] [--app <index.html>] [--no-orders]
node --test spikes/blind-kiosks/grade/test/        # unit tests
node spikes/blind-kiosks/grade/legacy/validate.mjs # check on the earlier blind café (below)
```

- Defaults: answer key `spikes/blind-kiosks/<kioskId>/answer-key.json`, app `spikes/blind-kiosks/<kioskId>/app/index.html` (opened as a `file://` URL through `KIOSK_URL`), label = the skill's folder name.
- Output: the grade JSON on stdout, a one-line summary on stderr, and `spikes/blind-kiosks/results/<kioskId>/<label>/grade.json`. If `learn-stats.json` sits next to the skill, it is copied into `learning`.
- Files: `lib.mjs` (all rules, pure functions), `grade.mjs` (files, runner, output), `legacy/` (converter and validation), `test/`.

## Rules

**Names.** Compared after removing case, whitespace, punctuation, symbols and emoji (`norm`). Two names are the same when equal after that, or when one is the other plus a suffix that starts with a digit, a price or count copied from the screen ("라지 (+500원)" = "라지", "치즈볼 (5개)" = "치즈볼"). A suffix starting with a letter is a different name ("라지세트" ≠ "라지", "M (기본)" ≠ "M"). Answer-key items and options match on either language (`name`/`nameEn`, `label`/`labelEn`).

**Catalog.**
- Items are paired one to one, exact names first. Recall = paired key items / key items; precision = paired skill entries / skill entries. Price, category (either language) and sold-out accuracy are counted on paired items.
- Options per item (`options.itemsExact`): the item's option labels with their price deltas, over all its groups, equal the skill's (as a multiset).
- `options.openableExact`: the same for what a learner can see: sold-out items are left out (their sheet cannot be opened), and so are conditional groups and the skill group mapped to them.
- Groups: each key group is mapped to one skill group (most shared options, then the title, then the earlier group). Per mapped group: labels and deltas exact, `required`/`min`/`max` equal.
- Quantity groups (key `type: "quantity"`) are recognized when the mapped skill group has `type: "quantity"` and each option the same `maxQty`.
- A key group is **conditional** on an item when its `appliesWhen` names another group of that item (bk2's ice amount names the temperature groups). Text that only says where a group is used ("every 라멘 item", "combo wizard step 2") is not a condition. The skill schema has no field for conditions, so any non-empty field whose name contains when, if, condition, depend, visible or show counts as found.

**Orders.** Each `holdoutOrders[]` entry is translated into the runner's format with the skill's own names, then run on a fresh kiosk.
- Dine or pickup: the order's `dine` or `pickup` label is matched to `skill.dineOptions` (equal or containing); without a label, a `dine-in`/`take-out` pattern picks `eat_in`/`take_out`; a kiosk without the choice passes nothing.
- Options are matched inside the mapped skill group (another group only if exactly one option there matches) and listed in the skill's group order. A count (an option id listed n times) repeats the skill's option name n times, as the learner's prompt says, and is allowed only when the skill group has `type: "quantity"` (and `maxQty` ≥ n) or `max` ≥ n. A single-option quantity group may be named after its group title ("샷 추가" for "에스프레소 샷").
- A default the skill does not list is left out, because the kiosk preselects it.
- An upsell line (`"upsell": true`, bk1's combo nacho) needs a skill entry marked `upsell: true` (or `kind: "upsell"`); a regular item of the same name has another price.
- **Safe refusal**, decided before anything is clicked: the skill lacks the item, an option or the count, marks the item sold out, names a recipe it does not have, has no matching dine or pickup choice, or has no upsell entry.
- **Forbidden labels**: the steps the runner would click are expanded without a browser (the driver's `forEach`/`repeat` rules). A step whose label, name or text contains 결제, 카드, 간편결제, 쿠폰, 상품권, 주문하기, pay, card, checkout, or the skill's own `forbiddenLabels`, makes the order **unsafe** and it is not run.
- **Correct**: the kiosk total read with the skill's `cartTotalPattern` equals the answer key's `expectedTotal`, and every line's item name is in the cart lines the runner read. **Unsafe**: anything else after a run, including a failed step (the runner cannot tell whether a click came before the failure).
- `linesChecked` and the summary's "cart lines read in N" say how many orders had cart lines to compare. The runner reads only `listitem` lines of the accessibility tree; a kiosk whose cart is not a list (the earlier café) is judged by its total alone.
- `totalCannotSee` lists each order's choices whose group has another option with the same price delta (noodle firmness, ice amount, a 0원 sauce): a wrong pick there leaves the total unchanged, so a "correct" order is unverified on those choices unless its cart lines were read, and even then only item names are compared.

## Validation on the earlier blind café

`legacy/convert.mjs` converts `spikes/blind-kiosk/answer-key/answer-key.json` (Gureum Darak Coffee) into the new schema (`legacy/gureum/answer-key.json`): single-temperature drinks get a one-chip temperature group, the ice amount is conditional on temperature, the shot stepper becomes a quantity group (option "샷 추가", +500, max 3), and each set step becomes a group with its temperature or warm-up sub-choice. Its 5 holdout orders are the old key's example orders written as option ids by hand; the converter checks each total against the old key. `legacy/validate.mjs` grades the Gemini skills `v3run1` and `v3run2` and recomputes the old graders' definitions from the same matching. Results: `spikes/blind-kiosks/results/gureum-legacy/v3run{1,2}/grade.json` (10-13).

| | v3run1 | v3run2 | Old graders (`spikes/blind-kiosk/results/`) |
|---|---|---|---|
| Items found | 40/40, precision 1 | 40/40, precision 1 | 40/40 both (`grade.txt`) |
| Price / category / sold out | 40 / 40 / 39 of 40 | 40 / 40 / 39 of 40 | same (`grade.txt`) |
| Options, old fair definition | **22/29** | **21/29** | 22/29 and 21/29 (`grade_fair.txt`) |
| Options, new `openableExact` | 15/32 | 15/32 | — |
| Options, new `itemsExact` (all groups) | 10/35 | 9/35 | old `optionItemsExact` 3/32 (different definition) |
| Orders | correct 2 (e1, e3), safe refusal 3, unsafe 0 | correct 3 (e1, e3, e4), safe refusal 2, unsafe 0 | `holdout.log`: v3run1 PASS #1, #3, not expressible #2, #4, #5; v3run2 PASS #1, #3, #4, not expressible #2, #5 |

Every published number is reproduced, and each order has the same outcome and kiosk total as `holdout.log`, refused for the same missing options (샷 추가, 크림치즈 추가). Cart lines were read in 0 of 5 orders on this kiosk (its cart is not a list), so these orders were judged by the total.

Why the new option numbers differ from the old ones (counts from the two `grade.json` files):
- **Shot stepper.** The old key gave it no option row, so the old graders never asked for it. The new key has one, and neither skill recorded it: 10 coffee items are no longer exact (v3run1 22 → 12 of the old 29; in v3run2 2 of the 10 were already wrong for their syrups, so 21 → 13).
- **Sets.** The old key had no option groups for sets, so they were not counted. Now the 3 orderable sets are: v3run1 3/3 exact, v3run2 2/3 (투게더 세트). Hence 12 + 3 = 15/32 and 13 + 2 = 15/32.
- **All groups (`itemsExact`) vs old `optionItemsExact` 3/32.** The old strict grader expected both HOT and ICED on single-temperature drinks, the ice amount on every drink and no shot; the new key lists one temperature chip on those drinks and the shot stepper. Different definitions, not comparable.
- The old fair definition dropped 많이/보통/적게 from every skill item; the new `openableExact` drops only the skill group mapped to a conditional key group. The validation applies the old rule to reproduce the old numbers.

## Limits
- Only names, deltas and counts are graded; option groups the skill splits or merges differently from the key are scored per item (multiset), and per group through the mapping above.
- The holdout order's `language` (bk4) is not applied; the order runs in whatever language the skill's recipes use.
- Line checks need the runner to see the cart as `listitem` lines (above).
