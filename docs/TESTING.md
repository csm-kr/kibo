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

Report pass rate per type.

## End to end
- `npm run test:e2e`: Playwright against the dev server with the in-memory store, no model calls. `npm run test:e2e:live` runs only the `@live` tests (`/demo` typed order to real Gemini; needs `GEMINI_API_KEY` in `.env`).
- Real phones (iOS Safari, Android Chrome) from QR scan to order number; three consecutive passes the day before recording.
- iOS checks: mic permission persistence across visits, silent switch, volume, AI voice feeding back into the mic, KakaoTalk/Naver in-app browsers.
- Live reconnect (network switch, screen lock).

## Measurements
- **Touch vs voice:** the same final cart, 3 touch runs and 3 voice runs; report medians of taps/utterances and seconds.
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
| Learn a non-blind pizza kiosk (Gemini 3.8 Flash) | 5.5 min, 72 turns, 635,725 input tokens | `spikes/kibo-learn/results/stats.run2.json`, `learn.run2.log` | measured |
| Replay unseen pizza orders | 4/4 + 1 rule violation detected | `spikes/kibo-learn/results/holdout.run2.log` | measured |
| Blind cafe learning success (Gemini) | 2/3 (10.3 min, 15.1 min) | `spikes/blind-kiosk/results/v3run{1,2,3}/learn-stats.json` | measured |
| Blind cafe catalog accuracy (Gemini) | items 40/40; options 22/29 and 21/29 | `spikes/blind-kiosk/results/v3run{1,2}/grade.txt`, `grade_fair.txt` | measured |
| Blind cafe example orders (Gemini) | 2/5 and 3/5 pass; rest refused before execution | `spikes/blind-kiosk/results/holdout.log` | measured |
| Blind cafe with coverage audit (gpt-6.1-sol, dev only) | items 40/40, audit passed, example orders 2/5 | `spikes/blind-kiosk/results/blind-sol2/` | measured, dev only |
| Coverage audit regression | 4/4 | `spikes/kibo-learn/test_audit.mjs` | measured |
| Prototype hero order (reference only) | touch 19 taps vs 5 utterances + 4 phone taps + 3 kiosk taps | `design/prototype/e2e_check.py` | measured, not for the deck |
| Touch hero order on `/kiosk` (automated tap count) | 41 taps, total 14,800원. Path: both sets added with fries M, then [전체 삭제] and both re-added with fries L, because the kiosk cannot change options on a cart line. The run's 3 s is Playwright speed, not a human timing | `evidence/touch-hero.json` (`e2e/kiosk-touch.spec.ts`, 10-12) | measured, taps only |
| Touch vs voice on the real `/kiosk` | — | 10/16 measurement log | planned |
| Latency (a)(b) | — | 10/14–16 measurements | planned |
| Agent evaluation pass rate | — | 10/13 eval results | planned |
| Cost per session | — | 10/14 token log | planned |
| Real kiosk tap counts | — | field notes (10/13) | planned |

Gemini numbers are the ones to publish. OpenAI runs are development aids only.
