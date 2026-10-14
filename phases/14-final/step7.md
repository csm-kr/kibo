# Step 7: numbers-final

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. TESTING "Measurements" and "Evidence ledger", RULE R-001.
- `docs/plan/judges/JUDGE_QA.md` row A7 and `docs/plan/judges/tech/REPORT.md` "Numbers drift"; `docs/plan/DECK_FACTS.md`, `docs/plan/SUBMISSION.md` ("Solution description", `scripts/submission.test.ts`), `README.md`, `src/app/page.tsx`, `src/lib/demo/evidence.ts`, `spikes/blind-kiosks/RESULTS.md`, `evidence/*.json`, `evals/results/*`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
Judges found the same claim with different numbers (eval 32/32 vs 42/42 vs 44/44; voice 6/6 and 1,084 ms vs 8/8 and 974 ms; bridge 68–528 vs 62–551 ms) and a failed voice run left out of the evidence (I-115). One source of truth, all attempts counted.

## Task
1. `docs/plan/NUMBERS.md`: every published number (landing, `/demo`, `/learn`, README, DECK_FACTS, SUBMISSION, video script): claim, value, evidence file, date, run conditions, and every place it appears (find them with grep). One value per claim: the newest full run; stitched or partial runs are not headline numbers.
2. Voice: report "N attempted / M passed / K upstream failures" from the evidence files, including failed runs (restore I-115's failure in the record if it was removed; explain in one line).
3. Re-measure once on the final code: `npm run eval:agent` (Vertex locally; say so), `npm run measure:cost` (text and voice; voice through the relay if the key path is unavailable, and add Vertex AI Live prices with URL and date). Production typed latency: a small script that sends 6 typed hero turns to the deployed `/api/chat` (one session, sequential) and records per-request ms → `evidence/prod-latency.json` (cost: 6 messages).
4. **Voice fixtures bug (found by the video agent, 10-14):** `scripts/make-voice-fixtures.ts` writes the Gemini TTS response's 44-byte WAV header and ~140 ms of trailing bytes into `e2e/fixtures/*.wav` as audio and upsamples 24→48 kHz by linear interpolation, so every voice E2E sentence starts with a 1 ms click and ends with a full-scale noise burst. Fix the generator (strip the header, trim to the speech, proper resampling or keep 24 kHz with the right header), regenerate the fixtures, add a test that the fixtures have no flat-top runs or impulses at the edges, then re-run `npm run test:e2e:live` once and record the voice numbers anew (both paths), marking earlier voice evidence as "fixtures with a click and noise tail".
5. **Learning cost evidence:** `scripts/learn-cost.ts` reads every `spikes/blind-kiosks/results/*/{baseline,final,final-after-fix}/learn-stats.json` and the Doughhouse run 3 stats, multiplies input (uncached), cached input and output tokens by the official prices in `evidence/cost-per-order.json` (`flashInput`, `flashCachedInput`, `flashOutput`), and writes `evidence/learn-cost.json` (per run: tokens, minutes, finished, USD; note that the learner ran on Vertex AI and that thinking tokens are not recorded if that is the case). Test the arithmetic. The deck and video quote learning cost only from this file.
6. Fix every place that disagrees with NUMBERS.md; update the SUBMISSION description (≤ 1,024 chars, test passes).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. NUMBERS.md lists every number shown on `/`, `/demo`, `/learn` and in README with an evidence path that exists; no surface disagrees.
2. Update this step in `phases/14-final/index.json`.

## Do not
- Do not rerun a measurement to get a better number.
- Break existing tests.

## Orchestrator notes (10-14 08:40, after phase 13 finished)
- Learned-kiosk order results: take them from each run's `grade-v2.json` (grader v2, I-183); `grade.json` is the v1 grader and is wrong for `bk6-themepark` (0/0/10 vs 10/0/0). `spikes/blind-kiosks/RESULTS.md` and `phases/13-blind-kiosks/qa/REPORT.md` already recomputed every number; NUMBERS.md must match them.
- R-014 (proposed) applies: every place that quotes learned-skill order results also says how often the skill's own total differed from the kiosk's (phase 13 QA counted 7 of 48).
- `learn-cost.ts` must include the fresh hold-outs (`bk5-restarea/final`, `bk6-themepark/final`) and the `bk2-bakery/final-after-fix` rerun, and label the latter "informed by bk2" (it ran after the I-193 fix that bk2 itself exposed; I-202).
- Keep the three groups apart wherever numbers appear: four test kiosks baseline → final (learner tuned on them), two fresh hold-outs (learner frozen), the Doughhouse development kiosk. Never add them into one headline total.
- Found by the deck review (10-14 08:50), close these here:
  - `evals/results/` has two runs after the 44/44 one: `14-07` scored 14/44 with HTTP 402 cuts (the AI Studio credit gap, not a model failure) and `14-19` is a 30/30 partial run on Vertex. NUMBERS.md states which run is the headline and why, and lists the others with their cause (all attempts counted, R-001).
  - The forged-command count (judges sent ~17 forged commands, all refused 401/403/409/400) has no evidence file. Write `scripts/attack-check.ts` (`npm run check:attacks`): it sends the forged-command set (wrong actor token, AI `confirmCheckout` without a tap or fresh utterance, stale `cartVersion`, `paid` from the phone, bad zod args, replayed `commandId`) to a local production build and writes `evidence/forged-commands.json` (each attempt, expected status, got status). No AI messages needed. Test it with Vitest where the logic allows.
  - "8 of 8 grounded" rests on scratchpad files outside the repo: re-run it as an eval or drop the number everywhere.
  - Shared-address check (JUDGE_QA A3): open 5 `/demo` pages in parallel from this machine against production for 3 minutes (no AI messages), record whether every page reached "Connected" and any 429 in `evidence/shared-address.json`. Quote it only from that file.
  - `docs/plan/DECK_FACTS.md` still lists the old café result, 42/42 and 6/6: bring it in line with NUMBERS.md.
- Languages (from 14-final:4 and the orchestrator's read of the Vertex page, `docs/plan/SOURCES.md` G1b): the claim is "the AI replied in each of 9 languages to a typed turn on both voice paths, 18/18 (`evidence/live-languages.json`); spoken input in those languages is not tested yet" unless a spoken test is added. Vertex AI Live's official list does not include Chinese, so never say Google supports Chinese on the relay path. NUMBERS.md carries the tested-language list as one claim.

## Orchestrator notes (10-14 14:15, KIBO Learn rounds 3 and 4 merged: `b802f6b`, `b4a89be`)
- New evidence: `spikes/blind-kiosks/ROUND3.md` and `ROUND4.md` (results under `spikes/blind-kiosks/results/<kiosk>/{final,final-attempt2,round3-informed,round4-informed}/grade-v2.json`). Keep the groups apart in NUMBERS.md and everywhere: the four test kiosks (tuned), each round's **fresh** kiosks (round 2: bk5 4/3/3, bk6 10/0/0; round 3: bk7 0/10/0, bk8 not learned in 2 attempts; round 4: **bk9 10/0/0, bk10 8/2/0**), informed reruns (never "unseen"), the Doughhouse development kiosk. All fresh kiosks together: 32 correct / 15 refused / 3 unsafe / 10 not learned of 60 orders over 6 kiosks; the 3 unsafe are all round 2. Headline allowed: "On two kiosks it had never seen, the latest learner got 18 of 20 orders right and refused the other 2; nothing was ordered wrong" with the full table one click away. Skill-total count (R-014): bk9 0 of 10, bk10 2 of 8.
- `scripts/learn-cost.ts` must include the round-3 and round-4 runs (`final`, `final-attempt2`, `round*-informed`), each labelled.
- `/learn`: publish the round-4 fresh `bk9-bunsik` run (trace in `results/bk9-bunsik/final/trace/`) as the **first** card with `npm run learn:runs` (same rules as phase 13 step 9: images unedited except format), labelled "never seen before this run; learned once, 9.6 min; 10 of 10 orders right"; keep `themepark` and `airport-shop` after it, `doughhouse` last. Update the landing's Learn fact, README and DECK_FACTS from NUMBERS.md.
