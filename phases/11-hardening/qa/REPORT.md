# QA report: 11-hardening (step 5)

Scope from `git diff main...HEAD -- src/app src/components src/hooks src/lib/i18n`: the font loading in `src/app/layout.tsx` (IBM Plex Sans KR without preload, weight 500 dropped) reaches **every screen** (K1–K8, KX, P1–P7, PX, D1–D3, `/`, `/learned/<kiosk>`, `/mic-test`); `/` and D1 pictures now resized by next/image (`src/app/page.tsx`, `DemoIntro.tsx`); D2/D3 scenario guide line after payment (`ScenarioGuide.tsx`, `phone.ts` `scenarioPaid`, I-144); the phone's voice tool runner waits for a learned kiosk's bridge (`useLiveVoice.ts`, `AssistantPanel.tsx`, I-155, no visible change). So the whole `npm run qa:ui` set is in scope.

Automated (10-13, this step): `npm run lint` pass; `npm run build` pass (only the known `metadataBase` warning, I-087); `npm run test` 806 passed, 1 skipped (the Firestore integration file, `FIRESTORE_IT`); `npm run test:e2e` 19 passed, 14 `@live` skipped; `python3 design/prototype/e2e_check.py` 42 pass, 0 fail; `npm run qa:ui` 26 passed, 263 records, **0 H**, 299 T (after adding one state). `npm run test:e2e:live` once: 12 passed (the `/demo` typed orders on MALO and the learned pizza kiosk, all 9 "Play it for me" scenarios, on Vertex AI), 2 failed: both voice hero orders, because the Gemini API key answers HTTP 402 "prepayment credits are depleted" (checked with one 1-token request, status only; I-104). Not a failure of this step; re-run after a top-up.

Regression of J1–J3 through the E2E suite: J1 touch (`kiosk-touch`, `kiosk-touch-efficient`), J1 phone to kiosk mirror and refused second claim (`kiosk-mirror`), J2 ticket machine and English kiosk (`kiosk-rail`, `demo-airport`), J3 judge path to the order number and [Try again] (`demo`), learned kiosk (`learned`, `demo-learned`), scenario guide (`demo-scenarios`, including the paid line), mic test. J1 by voice is unverified this step (I-104).

| Angle | Result | Notes |
|---|---|---|
| A Numbers | pass | 0 H on all 263 states. T misses are the same kinds as 9-polish (260 shared states, no new kind): brand line height (I-140, checker false positive), off-scale kiosk 40px spacing (I-042), `auto` margins (I-075, false positive), axe contrast "human review" (I-043) |
| B Visual heuristics | pass | Read: K3 with AI ring (Korean in IBM Plex after the font change), `/` hero and places at 1440 and 390 (resized pictures sharp), D1 at 1920, D3 done, P4 at 320, D2/D3 guide finished and paid. Known open: I-141, I-142, I-123 |
| C Flows | pass | Flow A (phone to kiosk), B (touch to order number, start over), C1–C5 through the E2E suite; the paid guide line points on to another scenario (C2a). Voice leg of Flow A not run (I-104) |
| D Journeys | pass with gap | J1 touch and mirror, J2 tickets in English, J3 judge path all pass; J1 by voice blocked by the key's credits (I-104) |
| E Nielsen 10 | pass | H1: after payment the guide no longer asks for an action already done (I-144 fixed). No other copy changed |
| F Accessibility | pass | axe 0 H everywhere; new state 0 H. Contrast "incomplete" items checked on the screenshots: dark text on white or tint (I-043 kind) |
| G Content | pass | New copy "Paid. Choose another scenario to try more." / "결제를 마쳤어요. 다른 시나리오도 해 보세요." names no item; no brands |
| H First 20 seconds | pass | D1 at 1440 and 1920: one sentence, three steps, three place cards, [Start]; pictures load resized |
| I Rules | pass after fixes | R-003: the paid guide state had no QA state; added `D3-scenario-paid-guide` (I-161). R-010: the viewport loop reset the guide's scroll and hid the "Your turn" line on the finished-guide screenshots; fixed for both states (I-160). R-001: README Lighthouse scores, DECK_FACTS cost ($0.0088, 85%, $0.0766, $0.0744–0.0771, $0.0930) and LOAD.md numbers match `evidence/lighthouse.json`, `cost-per-order.json`, `prompt-cache.json`, `load-check.json`; the cache storage price stays marked unverified. R-005: the extended demo QA test keeps its own address. I-099: `test:e2e` rewrote `evidence/touch-hero.json` and `bridge-replay.json`, and `test:e2e:live` appended two runs that never reached Gemini to `evidence/voice-e2e.json`; all three restored to the committed values |

## Audit items re-checked (AUDIT.md, fixed in steps 1–2)

| Item | Test (all passing, run in this step) |
|---|---|
| I-148 per-address daily budgets | `live-token/route.test.ts` "I-148: one address staying inside its per-IP limits for 10 minutes leaves voice for everyone else"; `chat/route.test.ts` "I-148: one address gets 300 messages a KST day…"; `ip.test.ts` `takeDailyBudget` (3) |
| I-149 open-stream cap | `session/[id]/events/route.test.ts` "I-149" (3); `ip.test.ts` `openStream` |
| I-150 token counted only when issued | `live-token/route.test.ts` "I-150"; `live.test.ts` "I-150" |
| I-151 late transcript chunk | `turns.test.ts` "I-151" |
| I-152 learned text cannot close `<menu_data>` | `instructions.test.ts` "I-152" (3) |
| I-153 learned page origin documented | SECURITY "Learned kiosks"; its review grep on `public/learned-kiosks/` finds nothing |
| I-156 deploy and build context | `scripts/deploy.test.ts` (4), `scripts/build-context.test.ts` (6) |
| I-100, I-155 (also fixed this phase) | `instructions.test.ts` "I-100"; `bridgeWait.test.ts`, `chat.test.ts`, `toolRunner.test.ts` |
| Payment safety probes | `src/app/api/audit.test.ts` (6) |

No `it.skip` left in `src/` or `scripts/`.

Issues: logged I-160 (fixed), I-161 (fixed); I-104 note (still 402, voice E2E failed at connect). Changed: `e2e/qa/demo.qa.spec.ts`, `docs/ISSUE.md`, `docs/UI_QA.md`.
