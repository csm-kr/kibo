# Testing and evidence

Every number shown in the deck or the video must come from a file listed in the evidence ledger below.

## Unit tests (Vitest)
- Cart math, option validation (required, min/max, hours, sold out), price deltas
- Session expiry and the "active in the last 30 s" extension
- Idempotency: duplicate `commandId`, **including a retry after another command slipped in between**
- Touch and AI changing the cart at the same time (transactions)
- State machine: QR claim during `ordering` keeps state; no payment without `confirming`; `requestCheckout` + `confirmCheckout` in one turn or one `/api/chat` request is rejected; an AI confirm within 1.5 s is rejected; a confirm-card tap needs no utterance; `paying → confirming` on edit; undo refused in `paying`
- Per-actor permissions: a phone token cannot send the card action; `cardAction` is refused for learned kiosks
- `/api/chat` history with tool turns is rejected
- Tool argument validation: negative and huge quantities, long strings, options from another item

## Agent evaluation set
About 20 utterances in Korean and English (the supported languages), each with the expected cart, grouped by complexity type:
1. several items at once
2. same item twice with different options
3. missing required choice → asks
4. remove/add ingredients
5. edit an existing line
6. sold out / out of hours → alternatives
7. count limits (toppings, on the learned Doughhouse kiosk)
8. unknown item → refuses
9. ambiguous ("one burger") → choice buttons

Report pass rate per type and per kiosk. Each case names its `kioskId` (default `malo`); the airport rail ticket machine has its own cases for passengers, destinations, a transit card's top-up, sold out, travel facts not in the data (staff) and checkout. Cases are in `evals/agent-cases.json`; `npm run eval:agent` runs them against real Gemini through the text agent's backend (`auto` by default: `GEMINI_API_KEY` from `.env`, with Vertex AI through gcloud application default credentials as the fallback; `GEMINI_TEXT_BACKEND=api` or `vertex` pins one; the result counts the model calls each backend answered) and writes `evals/results/<KST time>.json` and `.md`.

## End to end
- `npm run test:e2e`: Playwright against the dev server with the in-memory store, no model calls. `npm run test:e2e:live` runs only the `@live` tests (`/demo` typed order to real Gemini, "Play it for me" for each of the 9 `/demo` scenarios in `e2e/demo-scenarios.spec.ts` (all 9 played through on 10-13, 8-scenarios:4; one run, no saved log), and `e2e/voice.live.spec.ts`: the hero order spoken to Gemini Live by a synthetic TTS voice through Chromium's fake microphone; needs `GEMINI_API_KEY` in `.env`). The voice fixtures in `e2e/fixtures/` come from `npm run fixtures:voice` (Gemini TTS); no real person's voice.
- Real phones (iOS Safari, Android Chrome) from QR scan to order number; three consecutive passes the day before recording.
- iOS checks: mic permission persistence across visits, silent switch, volume, AI voice feeding back into the mic, KakaoTalk/Naver in-app browsers.
- Live reconnect (network switch, screen lock).

## Measurements
- **Touch vs voice:** the same final cart, 3 touch runs and 3 voice runs; report medians of taps/utterances and seconds. Protocol and JSON template: `scripts/measure-touch.md`, `evidence/human-runs.template.json`. The `/demo` end card (D3, MALO) shows this session's own counts next to the touch numbers: the medians from `evidence/human-runs.json` when it exists, else the automated efficient run's taps only (`src/lib/demo/evidence.ts`, bundled at build time).
- **Latency:** (a) end of speech → first audio reply ≤ 2 s; (b) end of speech → kiosk highlight ≤ 3 s. The deck uses the median of (b).
- **Real kiosks:** screens, taps and time for the hero order at two real fast-food kiosks (notes only, no photos). The simulator's tap count should be within ±20%.
- **Cost per session:** tokens for one 3-minute Live session and one `/api/chat` order, priced with official rates.

## UX check
The full UI QA pass (numbers, visual heuristics, flows, journeys, states) is in `docs/UI_QA.md`; findings go to `docs/ISSUE.md`. In short: walk flows A, B, C and every exception in `docs/UX.md` and the journeys in `docs/USER_JOURNEY.md` as a checklist; go through the heuristics table line by line and fix violations. If possible, have one person over 60 try Flow A and note where they stall.

## Harness and hook tests
```
python3 -m pytest -q scripts/        # harness executor (local) and Bash guard hook
(cd spikes/kibo-learn && node test_audit.mjs <pizzaUrl> <blindUrl>)   # coverage audit regression (fixtures are relative)
python3 design/prototype/e2e_check.py   # prototype state logic (42 checks)
```

## Evidence ledger
| Claim | Value | Evidence | Status |
|---|---|---|---|
| Learn a non-blind pizza kiosk (Gemini 3.8 Flash), run 3, **with the finish gate and coverage audit** | finished: 4.8 min, 63 turns, 482,553 input tokens; self-test 3/3 orders (one call); audit passed (0 missing, 0 unknown, 0 hidden), 10-13 | `spikes/kibo-learn/results/run3/learn-stats.json`, `learn.log`, `skill.json` | measured |
| Replay unseen pizza orders, run 3 skill | 4/4 + 1 rule violation detected; 546–697 ms per order | `spikes/kibo-learn/results/run3/holdout.log` | measured |
| Learn a non-blind pizza kiosk (Gemini 3.8 Flash), run 2, before the gate and audit | 5.5 min, 72 turns, 635,725 input tokens | `spikes/kibo-learn/results/stats.run2.json`, `learn.run2.log` | measured |
| Replay unseen pizza orders, run 2 skill | 4/4 + 1 rule violation detected | `spikes/kibo-learn/results/holdout.run2.log` | measured |
| Blind cafe learning success (Gemini) | 2/3 (10.3 min, 15.1 min) | `spikes/blind-kiosk/results/v3run{1,2,3}/learn-stats.json` | measured |
| Blind cafe catalog accuracy (Gemini) | items 40/40; options 22/29 and 21/29 | `spikes/blind-kiosk/results/v3run{1,2}/grade.txt`, `grade_fair.txt` | measured |
| Blind cafe example orders (Gemini) | 2/5 and 3/5 pass; rest refused before execution | `spikes/blind-kiosk/results/holdout.log` | measured |
| Blind cafe with coverage audit (gpt-6.1-sol, dev only) | items 40/40, audit passed, example orders 2/5 | `spikes/blind-kiosk/results/blind-sol2/` | measured, dev only |
| Coverage audit regression | 4/4, 10-13 | `spikes/kibo-learn/results/test_audit.2026-10-13.log` (`spikes/kibo-learn/test_audit.mjs`) | measured |
| Prototype hero order (reference only) | touch 19 taps vs 5 utterances + 4 phone taps + 3 kiosk taps | `design/prototype/e2e_check.py` | measured, not for the deck |
| Touch hero order on `/kiosk`, efficient path (automated tap count; **the number for the `/demo` card, deck and landing**) | 24 taps, total 14,800원, the same cart as the edit path. Path: fries L, drink and no pickles chosen in the sheet while adding each set, dessert declined, no clear-all. The run's 3 s is Playwright speed, not a human timing, so the card does not show it | `evidence/touch-hero-efficient.json` (`e2e/kiosk-touch-efficient.spec.ts`, 10-13; rewritten only with `EVIDENCE=1`) | measured, taps only |
| Touch hero order on `/kiosk`, edit path (footnote only) | 41 taps, total 14,800원. Path: both sets added with fries M, then [전체 삭제] and both re-added with fries L, because changing an option after adding needs delete and re-add on this kiosk (I-039). The run's 3 s is Playwright speed, not a human timing | `evidence/touch-hero.json` (`e2e/kiosk-touch.spec.ts`, 10-12) | measured, taps only |
| Bridge replay on the learned pizza kiosk (`/learned/doughhouse`) | 4 commands replayed and verified (dine option, two adds, one remove): replay 68–528 ms each, phone command to accepted report 86–799 ms; a cart edited by hand on the kiosk was caught (`ok: false`, staff called). One automated Playwright run on a laptop, dev server, memory store, no AI, 10-13 | `evidence/bridge-replay.json` (`e2e/learned.spec.ts`) | measured, automated |
| Touch vs voice on the real `/kiosk`, 3 human runs each | — | `evidence/human-runs.json` (`scripts/measure-touch.md`), 10/16 | planned |
| Latency (a)(b), voice hero order on `/demo` | 6/6 runs passed (hero-en 3/3, hero-ko 3/3), `gemini-3.8-live`, 10-13. (a) end of speech → first AI audio: median 2,070 ms (target ≤ 2 s, missed, I-082). (b) end of speech → kiosk highlight: median 1,084 ms (target ≤ 3 s). Synthetic TTS voice on a laptop (Chromium fake microphone), not a real phone; end of speech is the last voiced mic frame sent to Live | `evidence/voice-e2e.json` (`e2e/voice.live.spec.ts`, three runs of `npm run test:e2e:live`) | measured, synthetic voice |
| Latency on a real phone | — | 10/14–16 measurements | planned |
| Gemini Live speech recognition, with and without `inputAudioTranscription.languageCodes` (`gemini-3.8-live`, 180 clips: 30 kiosk sentences × 3 voices × clean and 10 dB SNR noise, 10-13) | Korean key-term recall without `languageCodes` 96.6% clean / 93.7% noisy, 5 of 120 Korean clips with no transcript; with `languageCodes` 97.1% / 95.4%, none empty; English 98.8% / 97.5% → 100% / 100%; same latency (median about 1.15 s after end of speech). One run per system. Synthetic TTS voices, offline comparison; non-Google systems were measured for reference only and are not used in the product | `spikes/voice-compare/RESULTS.md` (`results.json`) | measured, synthetic voice |
| Agent evaluation pass rate (text agent, `/api/chat` path) | **On the Gemini API key after the credit top-up (8-scenarios:0, 10-13):** full run 42/42 (100%): MALO BURGER 32/32, airport rail 10/10; all 122 model calls answered by the key, no request errors; per request median 5.9 s, p90 10.7 s; until the first command median 3.1 s, p90 5.6 s (`evals/results/2026-10-13T07-43.{json,md}`). Run with `GEMINI_TEXT_BACKEND=api` from the local `.env` (I-125); `auto`, the product default, takes the same path while the key works, and its Vertex fallback is unit-tested only. **Per kiosk, on Vertex AI (7-environments:4, 10-13):** full run 41/42 (97.6%): MALO BURGER 32/32, airport rail ticket machine 9/10 (the sold-out case offered its own alternatives, all real items, but not the same-category passes); per request median 6.9 s, p90 18.1 s; until the first command median 3.5 s, p90 11.5 s (`evals/results/2026-10-13T06-38.{json,md}`). After one ticket-only instruction line (sold-out alternatives from the same category; MALO's instructions unchanged), the 10 airport cases re-run 10/10 (`2026-10-13T06-50`, partial run). Airport types: passengers (2), destination ambiguity (2), transit card top-up, sold out, platform and timetable (staff, 2), item not sold (refuse), checkout. An earlier full run lost 6 cases to request errors (5 Vertex `RATE_LIMITED`, 1 `UPSTREAM`; `2026-10-13T05-51`, not counted, I-111). **On Vertex AI (the product's text backend since 10-13, I-104):** 32/32 (100%), `gemini-3.8-flash` thinking `low`, location `global`; per request median 6.0 s, p90 21.2 s; until the first command is applied median 3.3 s, p90 6.4 s (`evals/results/2026-10-13T04-56.{json,md}`). **Earlier, on the Gemini API key:** 32/32 (100%), `gemini-3.8-flash` thinking `low`, 10-13 after the grounding and batching instruction changes (I-072, I-081); types 1–6, 8, 9, checkout and grounded-reply (reply checked by `scripts/grounding.ts`), Korean and English; type 7 not covered yet. Cases written by the KIBO team, not an external benchmark. Per request median 5.1 s, p90 8.0 s; until the first command is applied median 2.3 s, p90 4.6 s (in-process, no network to the route). Earlier: 28/28 in each of two runs before the changes | `evals/results/2026-10-13T07-43.{json,md}`; `2026-10-13T06-38.{json,md}`, `2026-10-13T06-50.{json,md}`; `2026-10-13T04-56`; `2026-10-13T02-54.{json,md}`; earlier `2026-10-13T01-38`, `2026-10-13T01-45` (`npm run eval:agent`, cases `evals/agent-cases.json`) | measured |
| Cost per session | — | 10/14 token log | planned |
| Real kiosk tap counts | — | field notes (10/13) | planned |

Gemini numbers are the ones to publish. OpenAI runs are development aids only.
