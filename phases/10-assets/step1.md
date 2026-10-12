# Step 1: deck-assets

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: ARCHITECTURE "Deployment", "Application architecture"; TESTING "Evidence ledger"; RULE R-001.
- `docs/plan/SUBMISSION.md` and `docs/plan/STRATEGY.md` (read both: the deck slots, the 1,024-character description, the rubric words).
- Code: `src/app/page.tsx` (landing, inline architecture SVG), `scripts/landing-shots.ts`, `e2e/qa/*`, `public/landing/*`, `README.md`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Prepare the material the deck owner needs, from the real app and the evidence files.

### Screens for the deck: `scripts/deck-shots.ts` (`npm run shots:deck`)
High-resolution PNGs (device scale factor 2) into `docs/assets/deck/` (committed, each < 600 KB after compression): slot 7 "wireframes" (phone P3, P4, P6; kiosk K1, K3, K6 at 1080×1920 scaled to 1080 px high), slot 11 "snapshots" (`/demo` mid-order for each environment at 1920×1080, the "What the AI did" strip open, the scenario guide), and the architecture diagram rendered from the landing page's SVG to PNG (2400 px wide) and SVG.

### Submission text: `docs/plan/SUBMISSION.md`
Add a section "Solution description (draft)": an English description of **at most 1,024 characters** (count them in a test or a script and write the count next to it) that names how Firestore, Cloud Run and Gemini are used, what problem KIBO solves and for whom, and one measured number with its evidence file in a comment line under it (not inside the 1,024 characters). No pricing or sales pitch (T&C). Also a 2-sentence "elevator" version.

### Deck facts sheet: `docs/plan/DECK_FACTS.md`
One table per deck slot (from SUBMISSION "Deck") listing the facts the slide may state, each with its source file or URL and "measured" / "design" / "unverified" (R-001). Pull numbers only from `evidence/*`, `evals/results/*`, `spikes/*/results/*` and the TESTING ledger.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run shots:deck
```

## Verify
1. Run the AC commands; look at every deck PNG.
2. Count the description characters (≤ 1,024) and check every fact in DECK_FACTS has a source.
3. Update this step in `phases/10-assets/index.json` (completed + summary / error / blocked).

## Do not
- Do not create mockups; screens are real captures.
- Do not state numbers without evidence (R-001) or any claim of legal compliance.
- Break existing tests.
