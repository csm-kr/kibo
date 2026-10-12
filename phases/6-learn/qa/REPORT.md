# Phase 6-learn QA report

Scope: `/learned/doughhouse` (host page and KIBO widget: QR, then an item the bridge entered) at 1440×900, 1280×720, 1920×1080; D1 kiosk picker, D2 with Doughhouse and D3 learned end card (`/demo?k=doughhouse`) at 1440×900; the phone's learned states (P2 and P3 "The kiosk is entering it…", P3 "Please check the kiosk screen" after 15 s, P3 mismatch, P4 learned confirm card) at 390×844, 360×800, 430×932 and 320×700. The learned kiosk page in the iframe is a third-party stand-in and was not changed; its own issues are context only (I-096). The full `npm run qa:ui` run re-captured every other screen with 0 H.

Commands run on 10-13: `npm run lint`, `npm run build`, `npm run test` (567 passed, 1 skipped), `npm run test:e2e` (8 passed, 4 `@live` skipped: they need real Gemini), `python3 design/prototype/e2e_check.py` (42 pass), `npm run qa:ui` (16 passed, 0 H). `npm run test:e2e` rewrote `evidence/bridge-replay.json` and `evidence/touch-hero.json`; both were restored to the committed values (I-099, still open).

## Angles
| Angle | Result | Notes and issues |
|---|---|---|
| A Numbers | pass | 0 H and 0 T on every learned state, D1 learned, D2 learned and D3 learned (`ui-qa.jsonl`): targets, text sizes, focus, reflow at 320 |
| B Visual heuristics | pass, two open | One focal point per screen; the learned confirm card keeps the MALO card's layout without the pay button. Open: in `/demo` the KIBO widget covers two pizza tiles of the kiosk page (I-101); the learned phone shows the placeholder ring as dine and line photos (I-103) |
| C Flows | pass, one open | ARCHITECTURE sequence 3 walked by `e2e/learned.spec.ts` on the real page: dine option, two adds (kiosk upsell popup closed by the recipe), one remove, each verified by the kiosk's own total and lines; a cart edited by hand on the kiosk is caught (`ok: false`, `learned_mismatch`, session keeps its last verified cart). UX "Learned kiosk replay fails": phone says "The kiosk did not take that change. Please check the kiosk screen. Staff is on the way." (`e2e/demo-learned.spec.ts`, `assistant-P3-learned-mismatch-*.png`), [Call staff] stays in the header, slow replay shows "Please check the kiosk screen" with [Call staff] (`assistant-P3-learned-slow-*.png`); the kiosk shows its own cart. Open: SECURITY promises the cart is re-added after a kiosk restart; the bridge only restarts and lets the line check call staff (I-102) |
| D Journeys | pass, open items | J3 with Doughhouse: D1 → picker (selected = check icon + border + `aria-current`) → [Start] → D2 → the kiosk page fills itself and the widget says "담았어요: 페퍼로니" → learned review → D3 learned card ([Try again], [Try MALO BURGER]). Open: the D3 learned card starts below the fold at 1440×900 (I-073), D1 step 1 still says "Talk or type" until voice is checked on real phones (I-077) |
| E Nielsen 10 | pass | 1: pending, slow and mismatch states are all shown in words. 3: [Undo] only when the server would take it, disabled while pending. 5: no pay button on a learned review. 9: the mismatch line says what failed and what happens next |
| F Accessibility | pass | axe 0 H; the widget status is `aria-live="polite"`; the QR image has alt text in Korean and English; the D1 kiosk choice is links with `aria-current`, not colour alone |
| G Content | pass | Pizza names, prices and options only from `skills/doughhouse.json`; the phone's examples and placeholder are pizza items (I-098 fixed in 6-learn:3); the checkout label 주문하기 comes from the skill; no real brands |
| H First 20 seconds | pass | D1 with the picker still shows one sentence, three steps and one [Start]; the Doughhouse caption says the left half is an unchanged third-party screen learned once by KIBO Learn |
| I Rules | pass | R-001: every number added this phase names a file holding it (checked below). R-002: I-102 logged. R-003: every learned state is in `e2e/qa/learned.qa.spec.ts`, `learned-phone.qa.spec.ts`, `demo.qa.spec.ts`. R-004: no T misses on changed screens. R-005: the learned specs send their own `X-Forwarded-For` (192.0.2.20–23). R-006 (new, proposed) from I-045 and I-101 |

## Security spot checks
| Check | Result | Evidence |
|---|---|---|
| A pending item id not in the skill never reaches a click | pass | New unit test "a pending item that is not in the skill never reaches a click" (`src/lib/bridge/bridge.test.ts`): `createBridge().handle` with `hawaiian` clicks nothing on a page with the start tile and the category, and reports `ok: false`. `changeVars` runs before any `runPlan` (`bridge.ts` `replay`) |
| A forbidden label is never clicked | pass | `planSteps` refuses forbidden labels also when a variable fills them in; `isForbiddenTarget` checks label and full text before every click (`src/lib/bridge/recipe.test.ts`); the skill's checkout label must be forbidden (`learned.test.ts`) |
| `bridgeReport` from the phone token → 403 | pass | `service.test.ts` "bridgeReport with the phone token → FORBIDDEN (403)"; `machine.test.ts` actor check |
| No kiosk page text stored in the session | pass | `machine.test.ts` "never stores the kiosk's line text" (an injected line is absent from the whole session JSON, matched and mismatched); `e2e/demo-learned.spec.ts` checks the phone shows no kiosk line after a mismatch |

## R-001 check of numbers added this phase
| Where | Number | File and value |
|---|---|---|
| KIBO_LEARN, TESTING | run 3: 4.8 min, 63 turns, 482,553 input tokens, self-test 3/3 in one call | `spikes/kibo-learn/results/run3/learn-stats.json` (`minutes` 4.8, `turns` 63, `inputTokens` 482553, `tests` 1), `learn.log` #61 "PASS PASS PASS" |
| KIBO_LEARN, TESTING | audit 0 missing, 0 unknown, 0 hidden | `run3/learn.log` "audit #1: OK missing=0 unknown=0 hidden=0", "finish audit: OK" |
| KIBO_LEARN, TESTING | holdout 4/4 + violation, 546–697 ms | `run3/holdout.log` (610, 567, 697, 563 ms PASS; 546 ms DETECTED) |
| TESTING | audit regression 4/4, 10-13 | `spikes/kibo-learn/results/test_audit.2026-10-13.log` (4 PASS) |
| TESTING | bridge replay 68–528 ms, end to end 86–799 ms | `evidence/bridge-replay.json` as committed (replay 169, 528, 265, 68; end to end 228, 799, 306, 86) |
| Landing page, README | none added (one link to `/demo?k=doughhouse`) | — |
