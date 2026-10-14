# Phase 15-judge-fixes QA report (step 6, 10-15)

Scope: every screen this phase changed: P3 (reply and choices kept above the dock, cart summary hidden while choices show, "Continuing your order…", staff choice), P4 (reply above the card, pay button named in the AI's language), P5 (words only, no pay control), P-lang ("Language and text size" with [Larger text]), P0 `/app` (larger-text switch beside the logo), D1 (copy), D2 (card reader under the kiosk half, larger text on the phone half, learned pizza order before the dine option, airport rail unknown destination), L1 `/learn` and L2 `/learn/<runId>` (one headline, autoplay at 4×, English glosses), the landing `/` (headline, Sources toggles, diagram `/app`). Screenshots of this run are in this folder (`ui-qa.jsonl` lists each state, viewport and finding); the fresh-eyes re-walk of the round-2 judges' problems is in `fresh-eyes/`.

## Commands (run in this session, final code)
| Command | Result |
|---|---|
| `npm run lint` | pass (also after the doc and landing number edits) |
| `npm run build` | pass |
| `npm run test` | 1149 passed, 1 skipped (also after the edits) |
| `npm run test:e2e` | 51 passed, 17 `@live` skipped. It rewrote `evidence/bridge-replay.json` and `evidence/touch-hero.json` again (I-099); left uncommitted |
| `python3 design/prototype/e2e_check.py` | 42 pass, 0 fail |
| `npm run qa:ui` | 48 passed, **0 H** in 424 state × viewport rows; T only (below) |
| `npm run scan:repo` | 320 commits and the working tree, 0 findings |
| `npm run test:e2e:live` (once) | 14 passed, 3 failed. Voice 4 of 4 (direct and relay, hero-en and hero-ko) and the two-device Korean voice test passed; the other live tests (typed `/demo` orders, the remaining scenario players) passed. The 3 failures are "Play it for me" scenarios (MALO ai-cannot-pay step 1, MALO undo step 2, airport rail which-platform step 1) whose `/api/chat` answered `UPSTREAM` "The assistant isn't answering right now" with nothing applied (dev server on the local `.env` text backend; I-157 seen, I-268). The voice runs it appended to `evidence/voice-e2e*.json` are left uncommitted and counted in NUMBERS.md (32 attempted, 24 passed) |
| `npm run eval:agent` (once, backend `auto` as in production) | **73 of 77**, every case once in five back-to-back batches (the shell stops a command after 10 minutes), the API key answered all 186 calls, per request median 6.7 s, p90 12.7 s (`evals/results/2026-10-15-full.md`). Failures: `t6-ko-out-of-hours` (hung call after a refusal → `UPSTREAM`, I-268), `c-ko-for-the-kids`, `r-en-out-of-domain` (staff called, I-239), `l-es-order` (reply detected as English, I-269). New headline in NUMBERS.md, landing, README, DECK_FACTS, SUBMISSION (1,020 characters unchanged), TESTING |

## Angles A–I
| Angle | Result | Issues |
|---|---|---|
| A Numbers | pass: 0 H (text, targets, gaps, contrast, reflow, 200% text, text spacing, split words) | I-133 (English hint cut at 360 px with larger text, seen), I-264 (`tokens` on the zoomed sr-only heading) |
| B Visual heuristics | pass: D2 payment has one action and it is on the kiosk side (`demo-D2-payment-*`); the language and text-size sheet reads in two groups (`assistant-P-lang-picker-*`); larger text on `/demo` zooms only the phone half (`demo-D2-large-text-1440x900.png`) | I-142 (P4 two filled targets, unchanged) |
| C Flows | pass: Flow A typed and spoken (both voice paths, live), B touch, C D1–D3 on three places and own phone (`npm run test:e2e`); pizza order before the dine option continues after [Eat here] (`e2e/demo-learned.spec.ts`, live scenario); airport rail unknown destination and "to the airport" offer the machine's tickets with [Call staff] last (eval `r-en-rail-*` pass); card stand-in under the kiosk (`e2e/demo.spec.ts`, QA `D2-payment`); text size on `/assistant` (`e2e/app.spec.ts`, QA `P-lang-picker`); small-phone choices above the dock (QA `P3-reply-choices-large`); `/learn` autoplay at 4× with English glosses (`e2e/learn.spec.ts`) | I-268 (a model failure with nothing applied still shows the error line) |
| D Journeys | J1 Pay (no phone control pays), J1 Order at 360 px with larger text (question and [No thanks] in view), J2 Ticket (no silent swap, no instant staff call), J3 Land and Leave pass; with the text field open the last choice is half under the dock | I-133, I-270 |
| E Nielsen 10 | pass: status ("Continuing your order…", Working…), control (larger text one tap away, [No thanks], [Call staff] as a choice), errors in plain words; heuristic 9 weak when the model hangs with nothing applied | I-268 |
| F Accessibility | pass: axe WCAG 2.2 A/AA 0 violations; focus never obscured; text size reachable from every phone screen; contrast over images left to human review and checked on the screenshots (the card reader is ink on mustard) | I-043 |
| G Content | pass: names and prices from menu data; one learner headline word for word on landing and `/learn`; every eval number from NUMBERS.md; no third-party mark | — |
| H First 20 seconds | pass: D1 "Talk or type to the phone next to the kiosk." | — |
| I Rules | pass: R-001 (numbers cite files), R-002 (eval number changed in every "Appears in" place), R-004 (T misses below), R-005, R-009, R-012 (commit with explicit paths, evidence files left out), R-014, R-019 checked (I-133 seen in English) | — |

## T misses on changed screens (R-004)
- Spacing off the 4/8 scale from `auto` margins (landing, `/learn`, P3 price column): checker false positive, I-075.
- Spacing off the scale with larger text (P3-typing-ko-large, P3-reply-choices-large, P0 larger text; rem × 1.15 by design): checker false positive, I-166.
- `h1.sr-only` "1px" on `D2-large-text` (the zoomed phone half): checker false positive, I-264 (`tokens` part open).
- axe contrast "incomplete" (`bgOverlap`, `elmPartiallyObscured`): human review on the screenshots: the card reader (ink on the kiosk accent), the P-lang heading, the cart quantity pills and the landing SVG text read as dark on light; I-043.
- "font sizes > 4" on English kiosk screens: kiosk screens not changed in this phase.

## Round-2 judge problems (fresh-eyes re-walk)
Walked on a local production build (memory store, real Gemini on the API key) at 1440×900 and phone sizes. Screenshots in `fresh-eyes/`. Production (`kibo-00016-zj9`) still runs the code from before this phase.

| Judge item | Status | Evidence |
|---|---|---|
| Tech 1: deck quotes retired numbers | needs a person | NUMBERS.md, README, landing, DECK_FACTS and SUBMISSION agree (I-238); the deck slides themselves were not rebuilt in this phase |
| Tech 2: text agent slow, fallback weak | partly | No generic retry after an applied change (`ux1-malo-full-order-reply-1440x900.png`), "tickets to the airport" says what the shop sells (`tech2-malo-tickets-to-airport-1440x900.png`), 12 s reply budget. Still: the primary path is the prepaid key (I-104); a refusal followed by a hung model call still ends in the error line (I-268); eval per request median 6.7 s, p90 12.7 s |
| Tech 3: scaling ceiling | partly | Capacity math and the scale-out path in ARCHITECTURE "Capacity and scale-out"; nothing of the path is built (menus still compiled in) |
| Tech 4: Learn 18/20 is the offline runner | partly | Rounds 3–4 ported to the bridge except the review, `npm run skill:import`, bk9 h1/h3/h4 plan the runner's exact clicks (`scripts/skill-import.test.ts`); headline now "16 of 20 hands-free, 2 to staff". No never-seen kiosk run through `/learned/<id>` yet |
| Tech 5: ops and identity at demo level | partly | `cloudbuild.yaml`, `scripts/ops-setup.sh`, `CONFIRM_TAP_ONLY`, SECURITY "Background voice" written and unit-tested with fakes; never run on GCP (I-267); no kiosk provisioning secret |
| Impact 1: no real users, phones or kiosks | needs a person | — |
| Impact 2: no human voice shown | needs a person | Voice runs are still synthetic TTS (`evidence/voice-e2e*.json`) |
| Impact 3: deck contradicts README/landing | needs a person | as Tech 1 |
| Impact 4: adoption path unproven | needs a person | shop owner and vendor interviews |
| Impact 5: Learn headline outruns what ships | fixed (site and docs) | One sentence on the landing and `/learn` (`ux7-landing-learn-headline-1440x900.png`, `ux7-learn-fold-1440x900.png`), README, DECK_FACTS, SUBMISSION; the rendered video's narration is not re-cut |
| UX 1: correct order answered "say that again" | fixed | `ux1-malo-full-order-reply-1440x900.png`, `ux1-malo-phone-after-order.png` |
| UX 2: pizza order lost at "Eat here?" | fixed | `e2e/demo-learned.spec.ts` "order before dine survives the Eat here tap" (passes in `npm run test:e2e`); the learned live scenario passed in `npm run test:e2e:live` |
| UX 3: airport rail dead end | fixed | `ux3-rail-seoul-station-reply-1440x900.png`, `ux3-rail-phone.png`: the machine's tickets with prices, [Call staff] last; eval `r-en-rail-*` pass |
| UX 4: phone button pays on `/demo` | fixed | `ux4-demo-payment-1440x900.png`, `ux4-phone-pay-screen.png`, `ux4-kiosk-card-reader.png` |
| UX 5: larger text unreachable on the QR path | fixed | `ux5-qr-claim-landing-390x844.png`, `ux5-language-and-text-size-sheet-390x844.png`, `ux5-larger-text-on-start-390x844.png` |
| UX 6: bottom sheet hides questions on small phones | partly | Field closed: question and [No thanks] fully in view (QA `P3-reply-choices-large`). Field open: [No thanks] half under the dock (`ux6-reply-choices-large-360x800.png`, I-270) |
| UX 7: evidence overload, mismatched learner numbers | partly | One headline, Sources toggles, English glosses, autoplay at 4× (`ux7-*`); no tap dot on the `/learn` replay, the traces have no click positions (I-266) |

## What a person still has to do
1. **Deploy both services** (`sh scripts/deploy-voice.sh`, then `SHORT_APP_URL=kibo-2026.web.app sh scripts/deploy.sh`), check `/api/health?deep=1`, then re-run `npm run measure:prod-latency` and update NUMBERS.md (I-267, I-227, I-167).
2. **Create the Cloud Build trigger and run `sh scripts/ops-setup.sh --apply`** with `ALERT_EMAILS`; fix any flag gcloud refuses (I-267).
3. **Remove the prepaid-credit risk** on the Gemini API key (post-paid billing or a balance alert), Tech 2, I-104.
4. **Rebuild the deck slides from `docs/plan/NUMBERS.md`** (eval now 73/77 on `auto`) and grep for retired values; re-cut the video narration with the one learner sentence (Tech 1, Impact 3, Impact 5).
5. **Real people:** sessions with users aged 65+ and non-Korean readers, one real human voice on a real phone, and a few shop-owner interviews (Impact 1, 2, 4).
6. **Commit or restore the evidence files** the E2E runs rewrote: `evidence/bridge-replay.json`, `evidence/touch-hero.json`, `evidence/voice-e2e.json`, `evidence/voice-e2e-relay.json` are left uncommitted (I-099); NUMBERS.md counts the extra voice runs in its own text.
7. **Decide I-234's review read** (whether the bridge may open the kiosk's order review), the only round 3–4 part not ported.
