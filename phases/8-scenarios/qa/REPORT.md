# Phase 8 QA report (8-scenarios:4)

Scope: D2 with the scenario guide (closed, list, half done, finished), "Play it for me" (sending, stopped, failed), "What the AI did" (open, collapsed), on MALO BURGER, the airport rail ticket machine and the learned Doughhouse kiosk. Viewports 1440×900, 1280×720, 1920×1080 (learned and play states at 1440×900, failed also 1280×720).

Commands (10-13, this session): `npm run lint`, `npm run build`, `npm run test` (701 passed), `npm run test:e2e` (13 passed, 15 `@live` skipped), `python3 design/prototype/e2e_check.py` (42/42), `npm run qa:ui` (25 passed, 0 H), `npm run test:e2e:live` (14/14 passed, real Gemini).

New QA states in `e2e/qa/demo.qa.spec.ts`: `D2-scenario-finished`(+`-guide`), `D2-play-sending-guide`, `D2-play-stopped-guide`, `D2-play-failed`(+`-guide`), `D2-rail-scenario-half`(+`-guide`), `D2-rail-scenario-finished`, `D2-rail-scenarios-list-guide`, `D2-learned-scenario-start`, `D2-learned-scenario-finished`(+`-guide`). Guide closed is `D2-empty`; list and half done (MALO) and the strip open/collapsed existed from steps 2 and 3.

## Live scenarios (`npm run test:e2e:live`, real `gemini-3.8-flash` text agent on /demo, one run)
All 9 played through to the end of their checklist with "Play it for me", and none got past the review by itself:
malo sunja-lunch (20.7 s, two sets with Fries (L)), not-sure (7.5 s), sold-out (5.8 s), halal (6.5 s), ai-cannot-pay (13.3 s, "Just pay for me" stopped at the review), undo (12.1 s); airport_rail mei-tickets (16.2 s), which-platform (5.0 s); doughhouse learned-pizza (14.3 s, bridge replay). No failures to log. The same run: typed orders on all three kiosks and both voice hero orders passed (hero-en a 1,570 ms / b 803 ms, hero-ko a 3,001 ms / b 799 ms; not added to `evidence/voice-e2e.json`, I-099).

## Angles
| Angle | Result | Notes and issues |
|---|---|---|
| A Numbers | pass | 0 H on every new state (targets ≥ 56px, text ≥ 16px, focus, 200% text, text spacing, no page scroll). T: only axe contrast "incomplete" items, checked by eye (I-043) |
| B Visual heuristics | pass, P2 logged | One focal point per column; done chips fade (disabled) and keep a check plus "Done". "Your turn" line half below the guide's fold at 1440×900 (I-131); ticket placeholder cut (I-133). Known: AI pill and demo counter over the rail kiosk (I-045, I-113), widget over the learned kiosk tiles (I-101), focus-ring artifacts in later screenshots (I-121) |
| C Flows | pass, P2 logged | Walked through D2: C2a (choose → fresh order → chips → ticks → "Your turn"; Play needs the dine option first, stops at the confirm card), C2b (strip rows from recorded actions, hidden at confirm), C3 (text when Live refuses), C4/C5 unchanged. Exceptions via scenarios: ambiguous, sold out, not in kiosk data, misheard/undo (all played live). At 1280×720 the confirm card's total sits below the phone's fold (known, I-073) |
| D Journeys | pass, P2 logged | J3 judge: examples and the guide both reach the confirm card; J2 Mei's tickets and which-platform played live. Discoverability of [Scenarios] (I-132) |
| E Nielsen 10 | pass | 1 status: "Step n of N: sending/watch the kiosk…", "Stopped…", failure says what to do (9). 3 control: [Stop], [All scenarios], nothing in the guide confirms or pays. 8: guide closed by default, strip only on /demo |
| F Accessibility | fixed | H found and fixed: the phone scroll area was not keyboard-reachable while a message was in flight (I-130, also `/assistant`). Guide toggle has `aria-expanded`; player status is `role="status"`; strip is not a live region (by design) |
| G Content | pass | Strip rows come from `actionRow` (menu names via `findItem`, `choiceLabel`, `lineLabel`; fixed refusal words); guide text is fixed copy in `scenarios.ts` and `phone.ts` whose ids `scenarios.test.ts` checks against the kiosk data. No model text, ids or tokens on screen; no real brands. Korean "[네, 결제할게요]" matches the phone's `payNow` |
| H First 2 minutes (cold judge, 1440×900, no mic) | pass, P2 logged | Start → mic refuses → text comes forward; [Scenarios] → "The AI cannot pay" → Play: done in about 15 s live, the kiosk stops at the review and the guide says to tap [Yes, pay now] yourself. Risk: the toggle is easy to miss (I-132) |
| I Rules | pass | R-003 new states in the QA spec; R-005 new specs use 192.0.2.32–35 and .60–.67; R-009 [Yes, pay now] asserted in view with the guide open (MALO, rail); R-004 T misses are contrast human-review only (I-043), no new checker false positives; R-007 rail and learned guide copy checked on the screenshots; R-008 flows above; R-002 UI_QA and TESTING updated |
