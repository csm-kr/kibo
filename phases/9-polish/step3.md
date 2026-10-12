# Step 3: compare-card

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: PRD "Demo scenario" step 8 (touch N taps / M s vs K utterances / T s, measured values only), "Must keep" 3; TESTING "Measurements", "Evidence ledger"; RULE R-001.
- Evidence: `evidence/touch-hero.json`, `evidence/voice-e2e.json` (if present), `evals/results/*`.
- Code: `src/components/demo/*` (D3 end card), `src/components/kiosk/*` (demo counters `data-taps`, `data-seconds`), `src/components/assistant/*` (message counts), `e2e/kiosk-touch.spec.ts`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Show the touch-versus-talk difference to judges with honest numbers.

### D3 comparison card (MALO only)
After `paid` on `/demo?k=malo`, the end card shows two columns:
- **This order with KIBO:** the live counts of this session: sentences sent (typed or spoken), taps on the phone, taps on the kiosk half, and seconds from [Start] to the order number (measured in the browser for this session).
- **The same hero order by touch:** the tap count and time from `evidence/touch-hero.json`, labelled "automated run on this kiosk simulator" (it is not a human timing; R-001), shown only when the judge's cart matches the hero cart (2 cheeseburger sets with large fries etc.); otherwise show the hero numbers as "for the reference order" with one line explaining which order that is.
Import the evidence JSON at build time (no runtime file reads). If the file is missing, hide the touch column.

### Human measurement hook
Add `scripts/measure-touch.md`: a short protocol for the team to measure 3 human touch runs and 3 voice runs (PRD step 8) on the real `/kiosk?demo=1` and `/demo`, with a JSON template `evidence/human-runs.template.json`. The card prefers `evidence/human-runs.json` medians when that file exists.

### Tests
- Unit: the comparison builder (live counts, evidence present/absent, cart matches hero or not).
- E2E (no model): drive the hero order through the API on `/demo`, finish payment, and check the card shows both columns with the evidence values.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run qa:ui
```

## Verify
1. Run the AC commands.
2. Check: every number on the card is either live for this session or from an evidence file, and labelled as such.
3. Update this step in `phases/9-polish/index.json` (completed + summary / error / blocked).

## Do not
- Do not invent or round numbers into claims ("3× faster") unless computed from the shown values with the formula visible.
- Break existing tests.
