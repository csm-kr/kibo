# Phase 16-judge-r3-fixes QA report (step 3, 10-15)

Scope: what this phase changed. P3 choice questions and fixed labels in an AI-only language (ja, zh, es; a drink question and the dessert offer, at 390×844 and at 360×800 with larger text), the allergy answer ending on [Call staff] (P3, 390×844 and 320×700), a Korean typed order on `/demo`'s English screens through a choice tap (D2), the landing `/` and `/learn` where numbers and wording changed. Screenshots of this run are in this folder (`ui-qa.jsonl` lists each state, viewport and finding); the fresh-eyes re-walk of the round-3 judge's items is in `fresh-eyes/`.

New QA states (R-003): `P3-{ja,zh,es}-drink`, `P3-{ja,zh,es}-upsell` (each also `-large` at 360×800), `P3-ask-staff` (asserts the whole [Call staff] in view), `D2-ko-on-en-choices`, `D2-ko-on-en-after-tap` (asserts the tap sent "Cider" and the reply stayed Korean). The model is stood in by the test (no model calls), as in the other QA specs.

## Commands (run in this session)
| Command | Result |
|---|---|
| `npm run lint` | pass |
| `npm run build` | pass |
| `npm run test` | 1198 passed, 1 skipped (`scripts/numbers.test.ts` included) |
| `npm run test:e2e` | 49 passed, 1 failed, 18 `@live` skipped. The failure was a stale assertion: step 2 reworded the theme-park card but not `e2e/learn.spec.ts` (I-277); fixed, `e2e/learn.spec.ts` 10/10. **`evidence/` unchanged** (`git status`) |
| `python3 design/prototype/e2e_check.py` | 42 pass, 0 fail |
| `npm run qa:ui` | 54 passed, **0 H** in 441 state × viewport rows; landing and learn specs re-run after the eval-number edit, 5 passed |
| `npm run scan:repo` | 333 commits and the working tree, 0 findings |
| `npm run test:e2e:live` (once, **without `EVIDENCE=1`**) | 14 passed, 3 failed. **`evidence/` unchanged** (`git status`); the runs went to `test-results/evidence/`, so step 2's guard holds. Voice: direct hero-en, direct hero-ko (Korean reply; a 2,265 ms, b 1,492 ms), relay hero-en passed; relay hero-ko added both lines but replied in English (`bubbles=1 hangul=false latin=true`, I-272). Two-device Korean voice passed. Two "Play it for me" scenarios stopped on `/api/chat` `UPSTREAM` "The assistant isn't answering right now" with nothing applied (Sunja's lunch at "That's all. I'll pay.", Mei's tickets at "Add one child ticket too."; dev server on the local `.env` text backend, I-157, I-278). Counted in NUMBERS.md (40 voice attempts, 28 passed) |
| `npm run eval:agent` (once, all 82 cases, backend `auto` via `.env.eval-auto`) | **80 of 82**, one command, 10-15 09:56–10:07 KST, commit `4c1fda8`, the API key answered all 212 calls (no Vertex). Per request median 4.9 s, p90 7.8 s; first command median 2.3 s, p90 4.4 s. Groups: earlier 44/44, colloquial 12/12, language 16/16, recovery 8/10. Failed: `r-en-unsupported-modifier` (no "can't leave out the sauce" sentence, I-255 back), `r-en-out-of-domain` (staff called instead of choices, I-239). The 5 cases new in this phase all passed. `evals/results/2026-10-15T09-56.{json,md}` |

## Angles A–I
| Angle | Result | Issues |
|---|---|---|
| A Numbers | pass: 0 H on every new state (text, targets, gaps, contrast, reflow, 200% text, text spacing) | I-166 (rem spacing with larger text, checker false positive) |
| B Visual heuristics | pass: question, choices and [No thanks] read as one group in ja/zh/es (`assistant-P3-ja-upsell-large-360x800.png`); [Call staff] in staff tint apart from [No thanks] (`assistant-P3-ask-staff-*`) | — |
| C Flows | pass: Korean typed order on English screens through a choice tap stays Korean (QA `D2-ko-on-en-*`, fresh-eyes with real Gemini); allergy → [Call staff] → staff banner on phone and kiosk; swap keeps large fries and cider. Weak: a hung model call ends in a dead-end error line | I-278, I-157 |
| D Journeys | J1 Order/Fix (swap keeps choices) and J2 Ask (allergy honest, staff offered) pass on real Gemini; J2 for an AI-only language breaks when the model is slow (server summary in English) | I-269 |
| E Nielsen 10 | pass: 9 (errors say what to do) weak for typed `UPSTREAM` ("Please type instead" to a typing user) | I-278 |
| F Accessibility | pass: axe WCAG 2.2 A/AA 0 violations; new fixed labels carry `lang`; focus never obscured | I-043 (contrast "incomplete", human review on the screenshots: all dark on light) |
| G Content | pass: names from menu data, fixed words per language from `choices.ts`; allergy reply names only data allergens and never "safe"; landing/README/DECK_FACTS/SUBMISSION/TESTING quote the new eval from NUMBERS.md; relay latency now says the relay ran locally (R-001) | I-279 ("Asked which one: Call staff") |
| H First 20 seconds | pass on D1/D2 screens; the first typed order took 13–25 s in the fresh-eyes walk while a live run shared the key (eval median 4.9 s) | I-157 |
| I Rules | pass: R-001, R-002 (eval number in every "Appears in" place), R-003 (new states above), R-004 (T misses below), R-005 (new addresses 192.0.2.58–.60), R-009 ([Call staff] and [No thanks] asserted in view), R-012, R-020 (holds for text and direct voice; relay voice and AI-only summary fail, I-272, I-269), R-021 (no `evidence/` change from any test run) | I-269, I-272 |

## T misses on changed screens (R-004)
- Spacing off the 4/8 scale with larger text (`P3-*-large`, rem × 1.15 by design): checker false positive, I-166.
- axe contrast "incomplete" (`bgOverlap`, `elmPartiallyObscured`) on the quantity pill and the kiosk half: human review on the screenshots, dark on light; I-043.

## Round-3 judge items (fresh-eyes re-walk)
An agent that did not write the fixes walked them on a local production build (memory store, real Gemini on the API key) at 1440×900; 20 AI messages, 6 of them ended `UPSTREAM` after about 40 s while the live E2E run shared the key. Screenshots in `fresh-eyes/`. Production (`kibo-00018-p7q`) does not run this phase's code yet.

| Judge item | Status | Evidence |
|---|---|---|
| Problem 1: replies leave the user's language (typed Korean, choice tap) | fixed | `fresh-eyes/p1-ko-typed-order-1440x900.png`, `p1-ko-typed-cider-tap-1440x900.png` (Korean after the "Cider" tap); eval `l-ko-on-en-tap`, `l-ko-voice-like-en` pass; QA `D2-ko-on-en-*`. The choice question stays English on English screens by design |
| Problem 1: choice headers in Japanese/Korean chats | fixed for AI-only languages; by design for Korean on English screens | QA `P3-{ja,zh,es}-*`; `fresh-eyes/p1-ja-order-1440x900.png`, `p1-es-order-retry-1440x900.png` |
| Problem 1: AI-only language after a slow model call | not | the server's summary answered a Japanese user in English (`fresh-eyes/p1-ja-after-tap-1440x900.png`), I-269 |
| Problem 1: Korean voice | partly | live run: direct hero-ko replied in Korean; relay hero-ko replied in English (I-272) |
| Problem 2: slow first reply; "3.5 s" quoted alone | partly | README, DECK_FACTS and NUMBERS quote 8.3 s full order / 2.8 s follow-ups; the landing quotes no typed latency. The first typed order took 13.5–25.5 s in the walk (`fresh-eyes/p4-hero-*`); "Working…" has no per-action progress; production not re-measured (I-267) |
| Problem 3 / claims 1–3: evidence vs published numbers | fixed (repo) | `scripts/numbers.test.ts` 9/9 with `evidencePath.test.ts`; README, landing, DECK_FACTS, NUMBERS match the files; no test run changed `evidence/` |
| Problem 4: no real users or phones | needs a person | `evidence/human-runs.json` does not exist |
| Problem 5: swap drops earlier choices, claims "prepared" | fixed (1 of 3 tries reached the model; 2 ended `UPSTREAM` with the cart unchanged and no false claim) | `fresh-eyes/p5-ko-swap-1440x900.png`: Bulgogi burger set, Fries (L), Cider; eval `c-ko-swap-keeps-choices` pass |
| Problem 6: allergy without staff | fixed | `fresh-eyes/p6-allergy-1440x900.png` (burger, fries and cider allergens from data, no "safe", [Call staff] [No thanks]), `p6-call-staff-tapped-1440x900.png`; QA `P3-ask-staff`; eval `r-en-allergy-staff`, `r-ko-allergy-staff` pass |
| Problem 7: deck dense, internal ids | needs a person | the deck (`videos/deck-final/`, git-ignored) still has I-/R- ids and "separate AI review" |
| Claim 4: typed latency mixed | fixed (repo) / not (deck) | README:148, DECK_FACTS:118 split; deck source still "3.5 s" alone |
| Claim 5: theme-park card vs deck | fixed | `/learn` card: "the bridge stops such an order and calls staff" (`fresh-eyes/c-learn-full-1440.png`) |
| Claim 6: deck revision `kibo-00017` | needs a person | deck source still names it |
| Claim 7: finish-gate wording | fixed | README "≥ 3 different passing self-test orders", `/learn` "at least 3 different self-test orders", milestone "First self-test call passed: 3 of 3 orders" |
| Claim 8: voice speed range | fixed (repo) / not (deck) | every repo surface 1.7 s / 1.7 s; the relay's "run locally" added to landing, README, DECK_FACTS in this step; deck still "1.6–1.8" |
| Claim 9: bk10 options 2/14 hidden | fixed | README, DECK_FACTS, NUMBERS |

## What a person still has to do
1. **Deploy this phase** (`sh scripts/deploy-voice.sh`, then `SHORT_APP_URL=kibo-2026.web.app sh scripts/deploy.sh`), check `/api/health?deep=1`, re-run `npm run measure:prod-latency` on the new revision and update NUMBERS.md (I-267). The round-3 fixes are not live until then.
2. **Rebuild the deck from `docs/plan/NUMBERS.md`**: eval 80/82, typed latency split, voice 1.7 s / 1.7 s with "relay run locally", bridge 73–645 ms, current revision, no I-/R- ids, reword the A1 source line (judge problem 7, claims 4, 6, 8).
3. **Real people**: timed sessions with users aged 60+ and non-Korean readers on their own phones, one real human voice (judge problem 4).
4. **Decide the next agent fixes** (logged, not done here, because this step may not change features): server sentences in the seven AI-only languages (I-269), Korean replies on the Vertex relay (I-272), the typed `UPSTREAM` copy and a resend (I-278), the dropped-modifier sentence (I-255).
5. **Keep the Gemini API key funded** for judging; Vertex `global` is slow under parallel load (I-104, I-157).
