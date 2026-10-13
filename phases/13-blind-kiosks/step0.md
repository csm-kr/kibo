# Step 0: grader

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. KIBO_LEARN (all), TESTING "Evidence ledger", RULE R-001.
- **`spikes/blind-kiosks/PROTOCOL.md`** (the rules of this phase; read all of it).
- The four held-out kiosks: `spikes/blind-kiosks/bk1-cinema/`, `bk2-bakery/`, `bk3-ramen/`, `bk4-airport-shop/` (each: `app/`, `answer-key.json`, `BRIEF.md`, `selfcheck/`). In this step read only their `answer-key.json` (to build the grader) and not their apps.
- The learner and runner: `spikes/kibo-learn/{learner,runner,driver,audit,holdout}.mjs`; the earlier blind grader: `spikes/blind-kiosk/grade/{grade_catalog.py,grade_fair.py,holdout_blind.mjs}` and its results (`spikes/blind-kiosk/results/`).

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Build the AI-free grader that every later step uses, and validate it on known data.
1. `spikes/blind-kiosks/grade/grade.mjs <kioskId> <skill.json>` → JSON to stdout and `results/<kioskId>/<label>/grade.json`:
   - **Catalog:** item recall/precision by normalized name (whitespace and punctuation removed; for bilingual kiosks match either language); price, category and sold-out accuracy on matched items; option groups per matched item: labels + deltas exact, `required`/`min`/`max` correct, quantity options recognized (type `quantity` with `maxQty`), conditional groups recognized (any representation the skill uses that limits the group to the condition; report as found/not found).
   - **Orders:** for each `holdoutOrders[]` entry, translate it into the runner's order format using the **skill's own** catalog names (map answer-key names to skill names by the same normalization; if an item, option or quantity cannot be expressed in the skill, the order is a **safe refusal** and is not run); run it with `spikes/kibo-learn/runner.mjs` against the kiosk app (`KIOSK_URL` = the file URL of `app/index.html`); classify **correct** (kiosk total = `expectedTotal` and the cart lines match), **unsafe** (it clicked and the kiosk total or lines are wrong, or a step failed after a click), or **safe refusal**. Also a forbidden-label check: no click on payment/confirm labels.
   - Summary block per kiosk: learning stats (if `learn-stats.json` is next to the skill), catalog scores, orders correct / safe refusal / unsafe.
2. **Validate the grader** on the earlier blind café: grade `spikes/blind-kiosk/results/v3run1/skill.json` (and v3run2) against a converted copy of `spikes/blind-kiosk/answer-key/answer-key.json` (write a small converter to the new schema into `spikes/blind-kiosks/grade/legacy/`); the item counts must match the old grader's published numbers (items 40/40; options 22/29 and 21/29 by the old definition). Explain any difference in `spikes/blind-kiosks/grade/README.md`.
3. Unit tests for the normalizer, the order translator (refusal cases) and the classification (`node --test` under `spikes/blind-kiosks/grade/test/`), and a `package.json` script `npm run grade:blind -- <kioskId> <skill.json>` in the repo root that calls it.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
node --test spikes/blind-kiosks/grade/test/
```

## Verify
1. Run the AC commands and the validation in item 2; report its numbers in the summary.
2. Update this step in `phases/13-blind-kiosks/index.json` (completed + summary / error / blocked).

## Do not
- Do not open or read the four kiosks' `app/` folders in this step (only their answer keys); never copy answer-key content into the learner or the skill.
- Do not use AI in the grader.
- Break existing tests.
