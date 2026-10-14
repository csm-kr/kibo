# Step 2: evidence-guard

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. The sections that matter: TESTING (E2E, `@live`, evidence files), `docs/ISSUE.md` I-099, I-173, I-238 (class `evidence-overwrite` and `number-drift`), and `docs/RULE.md`.
- `docs/plan/NUMBERS.md` (the single source for every published number; its method notes for voice medians, attempts, bridge replay and typed latency), `docs/plan/DECK_FACTS.md`, `README.md` (Results table, the KIBO Learn finish-gate row), `src/app/page.tsx` (landing numbers), `src/app/learn/` and `src/lib/learn/` (the run cards, the theme-park card text).
- The specs that write evidence: `e2e/learned.spec.ts`, `e2e/kiosk-touch.spec.ts`, `e2e/kiosk-touch-efficient.spec.ts`, `e2e/demo-compare.spec.ts`, `e2e/voice.live.spec.ts`; also `scripts/capture-footage.ts` and `scripts/measure-touch.md`.
- `evidence/voice-e2e.json`, `evidence/voice-e2e-relay.json`, `evidence/bridge-replay.json`, `evidence/touch-hero.json`, `evidence/prod-latency.json`; `spikes/kibo-learn/learner.mjs` (the finish gate, `gate.passed.size >= 3`); `spikes/blind-kiosks/ROUND4.md` and `spikes/blind-kiosks/results/bk10-chicken/final/grade-v2.json` (its `summary` line: "options exact 2/14 (openable 2/13)").
- `videos/orchestrator/judges-r3/REPORT.md` if present (git-ignored), sections 2 (problems 2 and 3) and 3.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
The pitch is "every number has an evidence file". A fresh judge opened the files and found other numbers.

**1. The QA step rewrote three cited evidence files.** Commit `f611d12` (15-judge-fixes step 6) ran the E2E suites, which rewrote `evidence/voice-e2e.json`, `evidence/voice-e2e-relay.json` and `evidence/bridge-replay.json`, and committed them with broad staging. It is the third time for class `evidence-overwrite` (I-099, I-173).

| Measurement | Published | File now says |
|---|---|---|
| Voice direct: kiosk highlight / first audio | 1,833 / 2,708 ms | 1,669 / 2,382 ms |
| Voice relay: kiosk highlight / first audio | 1,641 / 2,611 ms | 1,715 / 2,841 ms |
| Bridge replay per command | 71–525 ms | 73–645 ms |
| Attempts in the two voice files (NUMBERS.md) | "24 attempted, 17 passed" | 28 attempted, 21 passed |

NUMBERS.md also still says those runs "were left out of the committed files". They are in.

**2. Typed latency.** "Typed reply median 3.5 s, p90 9.4 s" (`evidence/prod-latency.json`, revision `kibo-00016-zj9`) matches its file. But it mixes short follow-ups ("For here, please") with full orders. The judge waited 10.3 s for the first hero sentence and 12.4 s for the pizza; in the same file the hero sentence took 6.3–9.7 s.

**3. Other mismatches:**
- README says the KIBO Learn finish gate needs "≥ 3 passing self-tests"; `/learn` shows "Self-test 1/1 passed".
- The `/learn` theme-park card says that in 4 orders "the phone would have shown another price than the kiosk". Deck and README say such orders are handed to staff and the bridge applies nothing.
- The bk10 grade's "options exact 2/14" appears on no public surface.

## Task
1. **Stop tests from rewriting cited evidence.** Every spec and script listed above writes to `evidence/` only when `EVIDENCE=1` is set. Without it, it writes the same data to `test-results/` or a git-ignored folder, or skips the write. Keep each test's assertions unchanged.
   - Add `npm run evidence:live` (or document `EVIDENCE=1 npm run test:e2e:live`) in TESTING.md.
   - Unit-test the helper that picks the path, if you add one.
2. **One set of voice and bridge numbers, all attempts counted.** The files as committed in `f611d12` hold every attempt (28/21). They were measured on code newer than the published runs, so per NUMBERS.md's own rule ("newest full run on the final code") they become the source.
   - Recompute the medians and ranges exactly as NUMBERS.md says it computes them.
   - Update every surface that quotes them: NUMBERS.md (the values, the attempt counts, and the sentence about runs left out), DECK_FACTS.md, README, the landing page (`src/app/page.tsx` "1.8 s" / "1.6 s through the Vertex AI relay" or whatever it says), and any `/learn` or `/demo` copy.
   - Do the same for the bridge replay range.
   - If the method needs the first-audio and kiosk-highlight medians separately for direct and relay, keep them separate. Do not round a worse number into a better one.
   - List the old values under NUMBERS.md "Retired numbers" with the reason.
3. **A guard test.** Add a unit test (Vitest, e.g. `scripts/numbers.test.ts` or next to it) that reads the evidence files and checks that NUMBERS.md contains the computed values:
   - the voice direct and relay medians for kiosk highlight and first audio;
   - the attempt and pass counts;
   - the bridge replay min–max.
   It fails when a file and NUMBERS.md disagree.
4. **Typed latency, honestly split.** From `evidence/prod-latency.json` compute and publish two values next to the current one: "a full first order sentence" (the turns that add more than one item) and "short follow-ups". Use the file's own turns; do not re-measure here, because the orchestrator re-measures on the new revision after deploy.
   - Change the wording on README, the landing page, NUMBERS.md and DECK_FACTS.md so nobody reads 3.5 s as the wait for a full order. For example: "Typed reply on production: a full order sentence 6–10 s, short follow-ups about 2–4 s (median of all turns 3.5 s)", with the exact values from the file.
5. **Finish gate wording.** Read `learner.mjs` and `/learn`'s self-test display. Make README, `docs/KIBO_LEARN.md` and `/learn` say the same true thing. For example, "≥ 3 passing self-test orders" where the code counts orders, and make `/learn` show what it counts, if "1/1" refers to something else.
6. **Theme-park card and skill-total story.** Make `/learn`'s theme-park card say what the app does when the skill's own total differs from the kiosk's: the bridge stops and hands the order to staff, and the grader still counts the order lines right. Use the same words as README and the deck facts (R-014).
7. **bk10 option coverage.** Read the grade file to see what "options exact 2/14 (openable 2/13)" means. Add one short, honest line where the round-4 result is detailed (README's KIBO Learn row or `docs/KIBO_LEARN.md`, and DECK_FACTS.md for the deck). For example: "the learned option lists matched the kiosk exactly for 2 of 14 items with options; all 10 orders used options the skill had".
8. `docs/ISSUE.md`: log the overwrite (class `evidence-overwrite`, 3rd occurrence) and add the rule to `docs/RULE.md`: evidence files change only with `EVIDENCE=1` and a NUMBERS.md update in the same commit. Log the number mismatches under `number-drift`.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. AC commands pass. The guard test fails if you change one evidence value by hand (try it, then undo).
2. `git grep -n "1,833\|2,708\|1,641\|2,611\|71–525"` finds the old values only under "Retired numbers" or in history notes.
3. Update this step in `phases/16-judge-r3-fixes/index.json` (completed + summary listing every surface you changed).

## Do not
- Do not re-run the voice or bridge measurements to get better numbers. Use the files as committed.
- Do not edit the deck PDF or the video; the orchestrator rebuilds them from DECK_FACTS.md and NUMBERS.md.
- Do not delete any run from an evidence file.
