# Schedule, roles and cut order

Not injected into harness steps (lives under `docs/plan/`).

## Roles
- **Sungmin Cho:** all development (with Claude), video, README.
- **Ye Seul Ahn:** deck, real-device testing, field measurements, daily smoke test during judging.

## Plan (2026)
| Date | Development | Teammate | Done when |
|---|---|---|---|
| 10/11 (Sun) | ✅ GCP project, video engine skill, KIBO Learn experiments | — | — |
| 10/12 (Mon) | ✅ repo, Next.js skeleton, Cloud Run deploy (`/api/health`). Next: Firestore (`asia-northeast3`), Live API 30-min test, MALO JSON + `/kiosk` full touch flow (virtual payment, tap counter) + session/QR + sync, **security basics from the start** (kioskToken, deviceToken, sessionSecrets, recentCommandIds, zod); `/mic-test` page | — | Touch order to payment; a phone button changes the kiosk cart |
| 10/13 (Tue) | Text agent + 9 tools + server validation + `/demo` (text); evening: run the evaluation set | Field counts at two real kiosks (no photos); `/mic-test` on iOS and in-app browsers | Hero order works end to end by text |
| 10/14 (Wed) | Live voice + confirm card + undo + choice buttons (Flow A); **22:00 voice go/no-go** | Real-device voice E2E, deck draft, one sourced statistic on older users and kiosks | Hero order by voice, otherwise demo with text |
| 10/15 (Thu) | **KIBO Learn only:** audit and option lints, in-page bridge, Doughhouse integration and a voice order, one blind re-run with Gemini | Deck copy | One voice order on Doughhouse |
| 10/16 (Fri) | Morning: bug fixes, 3 touch + 3 voice measurements → **code freeze at noon** → record → render overnight | 18:00 receives numbers and screenshots | Video draft rendered |
| 10/17 (Sat) | Video, README, diagram, incognito URL check, gitleaks | Deck PDF ≤ 5 MB, **submit**, screenshot of the confirmation | Video ≤ 2:50 |
| 10/18 (Sun) | Buffer; never submit for the first time on this day | | |

## Teammate checklist
| Date | Task | Hand over |
|---|---|---|
| 10/13 | Screens, taps and time for the hero order at two real fast-food kiosks (notes only, no photos); `/mic-test` on iOS Safari and KakaoTalk/Naver in-app browsers | Notes, permission results |
| 10/14 | Real-device voice E2E (QR → talk → pay); silent switch, volume, voice feedback; deck draft (numbers left blank); one sourced statistic | Bug list, source |
| 10/15 | Deck English copy | — |
| 10/16 18:00 | Fill the deck with numbers (`docs/TESTING.md` ledger) and screenshots | — |
| 10/17 | PDF ≤ 5 MB, check the form, submit, screenshot | Screenshot |
| 10/19–11/06 | Daily `/demo` smoke test (one order); receive uptime alerts | Report issues immediately |

## Must keep
1. `/demo` on the deployed URL: MALO hero order end to end (voice; text if voice fails)
2. Confirm before pay
3. Touch vs voice measured comparison
4. One real order replayed on the learned pizza kiosk (video)

## Cut order (cut from the top)
1. Video engine improvements (render speed, recorder, zoom helper): use the engine as is, render overnight
2. Voice ordering on the blind cafe: keep it as learning evidence only
3. KIBO Learn improvements beyond the audit and option lints; one re-run instead of three
4. Generating ~35 MALO menu photos: use category images and icons (keep item count and option groups)
5. `updateCart` / `undoLastChange` on learned kiosks: mark as unsupported in the deck
6. Security items below High: list under "known limits" in the deck
7. Evaluation set from 20 to 10 utterances
8. If the bridge fails: show the learned kiosk with the local Playwright runner in the video only; keep `/demo` MALO-only

## Decided
- Theme: Sustainability & Social Impact. Virtual card payment. Fictional brands only (MALO BURGER, Doughhouse, Gureum Darak Coffee). Hospital kiosks: roadmap only.
- Architecture and safety decisions: `docs/ADR.md`.
- UX principles and flows: `docs/UX.md`.
- Images: generated offline (Codex image generation; earlier with Gemini). Product AI: Gemini only. OpenAI only for learner development.
