# Published numbers: one source of truth

Every number KIBO shows in public (landing `/`, `/demo`, `/learn`, README, `docs/plan/DECK_FACTS.md`, the form text in `docs/plan/SUBMISSION.md`, the video) comes from this file, and this file from an evidence file in the repo (R-001). Written 10-14 (14-final:7) after judges found the same claim with different numbers on different surfaces (JUDGE_QA A7, `docs/plan/judges/tech/REPORT.md` "Numbers drift").

**Rules**
- One value per claim: the newest **full** run on the final code. A partial run, or a total stitched from several runs, is never a headline.
- Every attempt counts: failed and cut-off runs are listed below with their cause, never dropped.
- Never rerun a measurement to get a better number.
- KIBO Learn groups stay apart and are never added into one headline: the four test kiosks (the learner was tuned on them), the never-seen kiosks (each new to that round's learner), informed reruns (never "unseen"), and Doughhouse (our development kiosk).
- Every place that quotes learned-skill order results also says how often the skill's own total differed from the kiosk's (R-014).
- To change a number: re-measure, update the evidence file, then this file, then every place in its "Appears in" cell (`grep` the old value too).

## Headline claims

| Claim | Value | Evidence | Date, conditions | Appears in |
|---|---|---|---|---|
| Text agent evaluation | **68 of 70** cases passed (earlier set 43/44, colloquial 11/12, language 14/14; MALO 56/58, airport rail 10/10, Doughhouse 2/2); per request median 5.7 s, p90 11.9 s; until the first command median 3.4 s, p90 6.8 s | `evals/results/2026-10-14T20-26.{json,md}` | 10-14 20:26 KST, final code, `gemini-3.8-flash` thinking `low` on Vertex AI (all 172 calls; local `.env` pins `vertex`), in-process, cases written by the KIBO team | landing (Direct adapter card), README Evidence, DECK_FACTS slot 12, SUBMISSION form text, TESTING ledger |
| Typed latency on the deployed service | median **4.8 s** per turn (6 typed hero turns, 1.9–6.7 s, all 200) | `evidence/prod-latency.json` | 10-14, revision `kibo-00014-859`, one session, sequential, from a laptop in Seoul; one run | README Evidence, DECK_FACTS slot 12, TESTING ledger |
| Voice hero order, end of speech → kiosk highlight | **1,833 ms** median direct (2 runs: 1,864, 1,802); **1,641 ms** through the Vertex AI relay (2 runs: 1,780, 1,501) | `evidence/voice-e2e.json`, `evidence/voice-e2e-relay.json` (`summary`) | 10-14, one `npm run test:e2e:live`, fixed fixtures (v2, I-237), synthetic TTS voice through Chromium's fake mic on a laptop, not a real phone; relay local | landing (Direct adapter card), README Evidence, DECK_FACTS slot 12, TESTING ledger |
| Voice hero order, end of speech → first AI audio | **2,708 ms** median direct, **2,611 ms** relay (target ≤ 2 s, missed, I-082) | same | same | README, DECK_FACTS slot 12, ADR-012, TESTING |
| Voice attempts on record | **24 attempted, 17 passed, 6 upstream failures** (the Gemini API key answered HTTP 402 at connect, I-104), **1 model failure** (an add-and-undo loop, I-115) | same files, `allAttempts`, `omitted`, `runs` | 10-12 to 10-14, both paths, both fixture versions; I-115's runs were restored to the file and the six 402 runs are recorded as counts (their records had been removed, I-099) | README Evidence, DECK_FACTS slot 12, TESTING ledger |
| Cost per hero order, text | **$0.0080** (median of 3, $0.0071–0.0086), 57,778 tokens of which 55,314 from the explicit prompt cache; hero cart 3/3 | `evidence/cost-per-order.json` (`costUsdPerOrder.text`) | 10-14, final code, Vertex AI backend priced at the Gemini API list prices read 10-13 (Vertex AI price not read, unverified); cache storage not included | DECK_FACTS slot 10, TESTING ledger |
| Cost per hero order, voice | **$0.0885** (median of 3, $0.0785–0.1050; $0.1084 if the unattributed prompt is billed as audio), 93,661 tokens; hero cart 2 of 3; in 2 runs the model called `confirmCheckout` right after opening the review and the server refused it | same (`costUsdPerOrder.voice`, `voice.runs`) | 10-14, direct Gemini Live on the API key, v2 fixtures, 4 turns (2 spoken, 2 typed) | DECK_FACTS slot 10, TESTING ledger |
| Prompt cache saving | text input cost per hero order **85% lower** before storage ($0.0588 → $0.0088), no latency gain | `evidence/prompt-cache.json` | 10-13, same day, on the API key. Never pair it with the 10-14 $0.0080 (another day and backend) | DECK_FACTS slot 10, TESTING ledger |
| Forged commands refused | **37 of 37** attacks refused with the documented status and code; session unchanged each time; 5 of 5 legitimate controls accepted | `evidence/forged-commands.json` | 10-14, local production build, memory store, no AI; one run | README Evidence, DECK_FACTS slot 12, TESTING ledger |
| Shared office address | **5 of 5** `/demo` pages reached "Connected" and stayed connected 3 minutes; no HTTP 429 | `evidence/shared-address.json` | 10-14, deployed service, one laptop, no AI messages; one run | TESTING ledger (quote only from this file) |
| Touch hero order | **24 taps** (efficient path); 41 on the edit path (footnote only) | `evidence/touch-hero-efficient.json`, `evidence/touch-hero.json` | automated Playwright runs on 10-13, taps only (no human time) | `/demo` Touch vs talk card (`src/lib/demo/evidence.ts`), README Evidence, DECK_FACTS slot 12, FOOTAGE, SUBMISSION video, TESTING |
| Touch vs talk, human timings | none yet | `evidence/human-runs.json` (not created) | planned | nowhere until the file exists |
| Languages | Screens Korean and English; the AI replied in each of 9 languages (ko, en, ja, zh, es, vi, fr, th, id) to a **typed** turn on both voice paths, **18/18**; spoken input in the seven AI-only languages not tested | `evidence/live-languages.json` | 10-14. Vertex AI Live's official list has no Chinese (`docs/plan/SOURCES.md` G1b): never say Google supports Chinese on the relay | landing Access list, README Known limits, DECK_FACTS slot 5, phone language picker note, PRD, TESTING |
| Speech recognition with `languageCodes` | Korean key terms 97.1% clean / 95.4% noisy; English 100% / 100% | `spikes/voice-compare/RESULTS.md` | 10-13, synthetic voices, 180 clips, one run | DECK_FACTS slot 12, TESTING |
| Lighthouse | Accessibility, Best Practices, SEO 100 on every page; Performance 100 / 98 / 100 / 88 / 99 | `evidence/lighthouse.json` | 10-13, local production build, not the deployed URL | README Evidence, TESTING |
| Load check | 5, 10, 20 concurrent API orders all paid; one shared address 1 of 5 paid then (limit raised since, I-154) | `evidence/load-check.json` | 10-13, local build, one run | TESTING only |
| KIBO Learn, never-seen kiosks, latest learner (round 4) | **2 kiosks, 62/62 items, 18 correct / 2 refused / 0 unsafe of 20**; skill total ≠ kiosk total in **2 of 18**; 9.6 and 14.2 min; $0.79 for both | `spikes/blind-kiosks/ROUND4.md`; `results/bk{9-bunsik,10-chicken}/final/grade-v2.json`; `evidence/learn-cost.json` | 10-14, learner frozen at `a9522a4`, one run each, grader v2 | landing (KIBO Learn card), README Evidence, DECK_FACTS slot 12, SUBMISSION form text, KIBO_LEARN, TESTING |
| KIBO Learn, every never-seen kiosk so far | **6 kiosks, 60 orders: 32 correct / 15 refused / 3 unsafe / 10 not learned**; skill total ≠ kiosk total in **6 of 35** that reached one. Round 2: bk5 4/3/3, bk6 10/0/0; round 3: bk7 0/10/0, bk8 not learned (2 attempts); round 4: bk9 10/0/0, bk10 8/2/0 | `ROUND4.md`, `ROUND3.md`, `RESULTS.md`; each run's `grade-v2.json` | 10-13 to 10-14, each kiosk new to that round's learner; the 3 unsafe are round 2's take-out orders (I-195, I-229) | landing (KIBO Learn card detail), README Evidence, DECK_FACTS slot 12, KIBO_LEARN, TESTING |
| KIBO Learn, four test kiosks (tuned) | finished 2 → 4 of 4; items 57 → 134 of 134; orders correct 5 → 31 of 40, **unsafe 5 → 5**; skill total ≠ kiosk total in **3 of 31**; $5.22 → $1.49 | `spikes/blind-kiosks/RESULTS.md`; `results/bk*/{baseline,final}/grade-v2.json`; `evidence/learn-cost.json` | 10-13 to 10-14; not a blind result (the learner was improved from these kiosks' baseline failures); baseline cost $6.80 with the crashed first bk4 attempt, $5.22 for the 4 reported runs | landing, README, DECK_FACTS slot 12, KIBO_LEARN, TESTING |
| KIBO Learn, Doughhouse (our development kiosk) | newest run: learned in **5.2 min**, 35 turns; **4/4** unseen orders replayed without AI (1.6–2.2 s each, offline runner) + 1 planted rule break caught; $0.23 | `spikes/blind-kiosks/results/dev/gemini-doughhouse-round3/`; `evidence/learn-cost.json` | 10-14, round 3 learner, not blind | landing (KIBO Learn card), README Evidence, DECK_FACTS slot 12, TESTING |
| `/learn` cards | each card shows its own recorded run, from its `public/learn/<runId>/run.json`: snack bar 9.6 min, 85 turns, 32/32 items, 10/0/0, skill total matched in all 10; theme park 12.7 min, 87 turns, 25/25 items, 10/0/0, wrong in 4; airport shop 8.1 min, 64 turns, 37/37 items, 10/0/0; Doughhouse traced run 4.0 min, 38 turns, 4/4 | `public/learn/*/run.json` (copied by `npm run learn:runs` from each run's `learn-stats.json` and `grade-v2.json` or `holdout.log`) | one recorded run each, labelled on its card | `/learn`, KIBO_LEARN "Watching a run" |
| Bridge replay inside the app | **71–525 ms** per command (4 commands); a cart edited by hand on the kiosk was caught | `evidence/bridge-replay.json` | one automated run, 10-13 23:01 UTC (the file the repo holds; E2E rewrites it, I-099); the 350 ms per-tap pause for people is not included | README Evidence, DECK_FACTS slot 12, KIBO_LEARN, ADR-007, TESTING |
| KIBO Learn cost per run | per run and group in the file; groups never added | `evidence/learn-cost.json` | Gemini API list prices; the learner ran on Vertex AI (price not read); thinking tokens not recorded (output cost a lower bound) | README, DECK_FACTS, KIBO_LEARN, TESTING |
| Problem statistics (17.9%, 76.6%, 206 of 233, 18.9 million, 466 kiosks, …) | as written in `docs/plan/SOURCES.md` | `docs/plan/SOURCES.md` S-ids with publisher links | read 10-13/10-14 | landing "Why it matters", PRD "Problem" |

## Every agent evaluation run
Full runs, oldest first. The headline is the newest; the others stay listed with their cause.

| Run | Result | Backend | Cause of any miss |
|---|---|---|---|
| 10-13 01-38, 01-45 | 28/28, 28/28 | API key | earlier, smaller case set |
| 10-13 02-36-2, 02-54 | 32/32, 32/32 | API key | — |
| 10-13 04-56 | 32/32 | Vertex | — |
| 10-13 05-51 | 36/42 | Vertex | 5 Vertex 429s and 1 upstream error (I-111), not agent misses |
| 10-13 06-11 | 37/42 | Vertex | 4 Vertex 429s, 1 sold-out alternative miss |
| 10-13 06-38 | 41/42 | Vertex | sold-out alternatives (fixed by an instruction line, partial 06-50 10/10) |
| 10-13 07-43 | 42/42 | API key | — |
| 10-13 13-55 | 44/44 | API key | — |
| 10-13 14-07 | 14/44 | API key | the key's prepaid credits ran out mid-run (HTTP 402, I-104): 30 cases got no model answer. The 30 were re-run on Vertex, 30/30 (`14-19`, partial). "44/44" stitched from these two is not a headline |
| 10-14 09-49 | 42/44 | Vertex | a too-broad internal-words check (re-run 3/3 after narrowing, `10-02`, partial) |
| 10-14 12-19 | 69/70 | Vertex | one case's expectation (fixed, `12-36`, partial) |
| 10-14 12-42 | 70/70 | Vertex | — (before `quickReply`) |
| 10-14 12-59 | 69/70 | Vertex | `l-es-ambiguous-picker-en` reply language undetected (flaky, I-228) |
| **10-14 20-26** | **68/70** | Vertex | **headline.** `co-en-pay-in-one-message` (the review was not opened), `c-ko-for-the-kids` (staff called instead of choices) (I-239) |

Partial runs (subsets after a change; never headlines): 10-13 02-36, 05-47, 06-50, 13-18, 13-19, 14-19; 10-14 09-59, 10-02, 11-54, 12-36, 13-18, 13-22, 13-23.

## Retired numbers (do not quote)
| Number | Why retired | Replaced by |
|---|---|---|
| Eval 32/32, 42/42, 44/44 | older runs; 44/44 was stitched from two runs | 68/70 |
| Voice 6/6, 8/8, highlight 1,084 ms or 974 ms, first audio 2,070 ms | fixtures with a click and a ~140 ms noise tail that counted as speech, so end of speech was late and latencies short (I-237); the 6/6 left out later runs and failures | the v2 voice rows above |
| Relay 2,089 / 2,155 ms, 1,212 / 1,084 ms | same fixtures | the v2 relay values |
| Bridge replay 68–528 ms, end to end 86–799 ms | the evidence file was rewritten by an E2E run (I-099) | 71–525 ms |
| Doughhouse 0.7–5.2 s, 5.5 min, 72 turns (run 2) | before the finish gate and audit | the round 3 Doughhouse run |
| Blind café 2/3 finished, 40/40 items, orders 2/5 and 3/5 | before the finish gate and audit | the blind kiosk test |
| Cost $0.0088 text, $0.0766 voice (as "per order today") | 10-13 code, other fixtures | $0.0080 and $0.0885 |
| Fresh pair "14 of 20" as the headline | round 2 only | round 4 18/20, all never-seen kiosks 32/15/3/10 |
| "7 of 48" skill-total mismatches | added the tuned and never-seen groups together | 3 of 31 and 6 of 35 |
| "8 of 8 grounded tool calls", production typed median 7.2 s (judge reports) | scratch files outside the repo | dropped; production latency from `evidence/prod-latency.json` |
| "~17 forged commands refused" (judge reports) | no file in the repo | 37 of 37 from `evidence/forged-commands.json` |
| 748 unit tests | no saved log | not quoted |
