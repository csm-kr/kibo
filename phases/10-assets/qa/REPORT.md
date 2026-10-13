# QA report: 10-assets (step 2)

Scope: no product screen changed in this phase (`git diff --stat main...HEAD`: scripts, docs, evidence, deck PNGs). Checked: the 12 deck pictures in `docs/assets/deck/` (read by eye), the 45 footage stills and `manifest.json` in `videos/footage/2026-10-13/` (read by a separate reviewer agent, fresh eyes), and `docs/plan/SUBMISSION.md` (description), `docs/plan/DECK_FACTS.md`, `docs/plan/FOOTAGE.md`. No fix touched a screen, so `npm run qa:ui` was not re-run.

Automated: `npm run lint` pass, `npm run build` pass, `npm run test` 747 passed, 1 skipped (748), `python3 design/prototype/e2e_check.py` 42 pass, 0 fail (10-13, this step).

| Angle | Result | Notes |
|---|---|---|
| A Numbers | n/a | No screen changed |
| B Visual heuristics | n/a (screens); pass with notes (pictures) | Deck pictures are real captures, no dev indicator, no error state, no placeholder text; readable at slide size except the learned pizza page (I-096). Guide close-up cuts its next hint mid-line (I-146) |
| C Flows | n/a | No screen changed |
| D Journeys | n/a | No screen changed |
| E Nielsen 10 | n/a | No screen changed |
| F Accessibility | n/a | No screen changed |
| G Content | pass after fixes | Every number in DECK_FACTS checked against its source (data counts 35/7, 11, 10; cost `evidence/cost-per-order.json`; benchmarks against the TESTING ledger); unverified items (law, unit test count, URL, human runs) are marked. No real brands, no OpenAI numbers for the product, no legal-compliance claim, no pricing. Description 998/1,024 characters (`scripts/submission.test.ts` passes). Fixed: "What the AI did" `0 ms`/`1 ms` rows must not be quoted (I-145); the "seats" example contradicted the corrected I-072. Footage: the pizza AI reply offers to pay on a learned kiosk (I-100), a stale "Your turn" line after paying (I-144) |
| H First 20 seconds (deck only) | pass with gap | P3 → K3 (AI ring) → P4 / K6 → P6 reads in order with English captions on the Korean kiosk; no deck picture of the pay step (P5, K7), footage stills cover it (I-146) |
| I Rules | pass | R-001: numbers cite sources or say unverified; I-143 (24 vs 41 taps) still open and flagged in FOOTAGE.md. R-010: one footage still taken before images loaded (I-147) |

Issues: logged I-145 (fixed), I-146, I-147; new evidence on I-100; Seen token on I-096; duplicated text in the I-072 row removed. FOOTAGE.md lists which stills of the 10-13 take to skip.
