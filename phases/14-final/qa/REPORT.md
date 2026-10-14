# Phase 14-final QA report (step 10, 10-14)

Scope: every screen this phase changed, K1–K8 and KX (MALO, airport rail, English), P0–P7, P-lang, PX, D1–D3 (MALO, airport rail, pizza, own phone), LK `/learned/doughhouse`, L1 `/learn`, L2 `/learn/<runId>`, the landing `/`, and the landscape kiosk with KIBO's status column. Screenshots of this run are in this folder (`ui-qa.jsonl` lists each state, viewport and finding).

## Commands (run in this session, final code)
| Command | Result |
|---|---|
| `npm run lint` | pass |
| `npm run build` | pass |
| `npm run test` | 1086 passed, 1 skipped |
| `npm run test:e2e` | 47 passed, 17 `@live` skipped (two runs: before and after the last fixes); the evidence files it rewrites (`bridge-replay.json`, `touch-hero.json`) restored to the committed values (I-099) |
| `python3 design/prototype/e2e_check.py` | 42 pass, 0 fail |
| `npm run qa:ui` | final run 47 passed, 0 H in 422 state × viewport rows (`ui-qa.jsonl`), 283 T. The run before it had 2 failures (`scan.qa` P0-scan never reached "scanning", `assistant.qa` P3 voice retry), both passed alone and in the next full run; not "focus obscured", cause unknown (I-252) |
| `npm run scan:repo` | 298 commits and the working tree, 0 findings (re-run before the commit: 0 findings) |
| `npm run test:e2e:live` (once) | 15 passed, 2 failed: the pizza scenario's second sentence got no `/api/chat` answer in 200 s (passed on one rerun, 2.0 min; cause: no timeout on model calls, **I-250, P1**); direct-path `hero-ko` voice connected but the model made no tool call (I-251; the relay `hero-ko` passed). The 4 voice attempts were taken out of the evidence files and counted in `docs/plan/NUMBERS.md` ("Voice attempts on record": 28 attempted, 20 passed) |

## Fixed in this step
- **Bridge refused "keep ordering"** (I-234, test first): `isForbiddenLabel` (`src/lib/adapters/learned.ts`) checks each line; a line is refused when it is a forbidden label, holds a payment word (결제, 카드, pay, card, checkout), or holds a forbidden label without starting with a keep-ordering word. `계속 주문하기` passes; `주문하기`, `주문 하기`, `결제하기`, `카드 결제`, `Pay`, `Continue to checkout`, `결제 취소`, `주문하기 23,400원` and a target whose text has a payment line stay refused. Stricter than the learner's rule. `e2e/learned.spec.ts` and the live pizza order pass. Payment rule unchanged: learned sessions still end at `confirming`.
- **Stale language claim**: D1 now says "Screens in English and Korean; the AI talks in 9 languages (tested by typing)." No other surface had the old line.
- **I-241** confirm-card jargon in `/demo` and the landing → "Opened your order review", "Tried to pay → you must confirm it yourself", scenario copy without brackets.
- **I-242** "Your turn" while paying → "Your turn: insert the card at the kiosk." (E2E + new QA state `D2-scenario-paying-guide`).
- **I-244** cut cart chip → a fade on the row's right edge while it holds more (overlay, so the focus ring still shows).
- **I-245** ₩0 tickets on `/learn` → "By option".
- **I-220 (H, back)**: `P3-upsell` at 320×700 "focus obscured" in 2 of 4 runs. Keyboard focus in the phone's scroll area now brings the control fully into view; 6 of 6 after. Third occurrence of its class → **R-018 (proposed)**.
- **SUBMISSION.md** quoted 18 of 20 without the skill-total count (R-014) → "(in 2 the skill's own total was off)", 1,021 / 1,024 characters, test passes.
- **`/learn` Doughhouse card** said 4.0 min while the landing says 5.2 min → the card says it is the traced run of an earlier learner and the newest run (5.2 min) kept no trace.

## Angles A–I
| Angle | Result | Issues |
|---|---|---|
| A Numbers | pass: 0 H (text, targets, gaps, contrast, reflow, 200% text, text spacing, split words); T only (below) | I-084 (320 px crowding, seen again), I-133 (Korean hint cut at 320 px, back, R-019) |
| B Visual heuristics | pass with P2s: one focal point on P4 still shared with the compact mic | I-142, I-243, I-249 |
| C Flows | pass: Flow A (typed and spoken, both voice paths), B (touch hero, efficient path 24 taps), C (D1–D3 on three places, own phone), exceptions (sold out, halal → staff, undo, stream busy, paused) through `npm run test:e2e` and the `@live` run | I-250 (a hung model call locks the phone) |
| D Journeys | J1 Sunja (P2–P6 at 320–430 px, Korean with larger text), J2 Mei (airport rail, AI-only languages), J3 judge (`/demo` 1280–1920) pass; J1 "Order" at 320 px is crowded | I-084, I-133 |
| E Nielsen 10 | pass: status (Working…, KIBO subtitle, replay line), control (undo, No thanks, start over), errors in plain words | I-248 (no English step line on K2/K3) |
| F Accessibility | pass: axe WCAG 2.2 A/AA 0 violations, focus visible and never obscured (R-018 fix 6/6), [Yes, pay now] fully in view in every confirm state; contrast over images left to human review and checked on the screenshots | I-043 |
| G Content | pass: names and prices from menu data; no "confirm card" in UI or replies; no third-party mark; D1 language claim matches NUMBERS.md | I-241 fixed |
| H First 20 seconds | pass: D1 on a laptop (one sentence, 3 steps, three place cards), on a phone the laptop note first | — |
| I Rules | pass: R-003 (new state in QA), R-005, R-009 ([Yes, pay now] fully in view in every confirm state), R-010, R-012 (explicit paths), R-014 (SUBMISSION), R-016 (label rule tests include `계속 주문하기`, `곱빼기`); R-018, R-019 added | — |

T misses (283, R-004): 157 axe "color-contrast incomplete, human review" over images, overlapping layers or half-scrolled text (real review items, I-043; read on the screenshots, all dark on light or white on KIBO blue/teal); 120 spacing off the 4/8 scale, almost all `auto` margins (`mx-auto`, `ml-auto`, `mt-auto`; checker false positive, I-075) and rem spacing under larger text (false positive, I-166); 6 "5 font sizes > 4" on English MALO kiosk screens, the 43 px is the fitted long tile name (by design, I-225).

## JUDGE_QA rows owned by P14 (fresh-eyes agent, did not write the changes; screenshots of this folder)
| Row | Verdict | Evidence | Still missing |
|---|---|---|---|
| D1 Korean kiosk explained | partly | `kiosk-K3-ai-highlight-1080x1920.png` (KIBO's "AI added: …" row), `demo-D2-confirm-1440x900.png`, `demo-D2-payment-1440x900.png` (English step line) | no English step line on K2/K3 (I-248); the subtitle names one of two lines (I-243) |
| D2 who confirmed | fixed | `demo-D2-payment-1440x900.png` ("You tapped Yes, pay now"), `kiosk-kiosk-pairing-paying-1440x900.png` ("Confirmed by you") | — |
| D3 where next | fixed | `demo-D3-done-1440x900.png`, `-1280x720.png` | — |
| D4 is it working | fixed | `demo-D2-play-sending-guide-1440x900.png`, `kiosk-K3-kibo-working-1080x1920.png` | 300 ms not measured in production; a hung model call has no way out (I-250) |
| D5 upsell and choices | fixed | `assistant-P3-upsell-320x700.png`, `assistant-P3-choices-320x700.png` | — |
| D6 small phone, large text | fixed | `assistant-P3-cart-summary-ko-large-320x700.png`, `assistant-P3-typing-ko-large-320x700.png` | crowding at 320 px (I-084), Korean hint cut (I-133) |
| D7 `/demo` on a phone | fixed | `demo-D1-intro-phone-390x844.png` | — |
| B4 see it learn and replay | fixed | `learned-widget-tapping-1440x900.png`, `-1280x720.png`, `demo-D2-learned-added-1440x900.png` ("7 taps · kiosk total ✓ matches"), `learn-*` | — |
| B5 getting onto a real kiosk | partly | landing, `/learn`, README | deck slide |
| B6 "third-party" Doughhouse | fixed | D1 card, LK panel ("our development kiosk") | — |
| A5 how fast | partly | Working… feedback; README 4.8 s typed median on production (one run, 6 turns) | real-phone voice (A6, human); no p90 on production |
| A7 numbers consistent | fixed after this step | 6 headline numbers matched NUMBERS.md on README, landing, components, SUBMISSION, DECK_FACTS; retired values only where labelled | the two mismatches found (SUBMISSION R-014, Doughhouse minutes) fixed in this step |
| C4 why not X | partly | `home-landing-whynot-1440x900.png` | deck slide |
| C7 how older people speak | partly | colloquial eval 11/12; vague requests get choices (`instructions.ts`) | `c-ko-for-the-kids` failed in the final eval (staff called), the case judges hit live (I-239) |
| C9 privacy | fixed on the web | `home-landing-trust-390x844.png` | deck slide |
| E1 public repo, licence, README | partly | MIT `LICENSE`, README rewritten | repo not public; the tool and gitlinks are untracked (`d0b96c2`) but stay in history (I-246); `.gitignore` lines uncommitted; `REPO_OWNER` unconfirmed |
| E2 fresh code | partly | README "Development timeline" | contest start date not checked against the 10-11 spikes (REPO.md) |

Other things the reviewer saw, judged not bugs: "Messages to the AI 0" and "What the AI did: Nothing yet" on some QA states (the QA specs send the AI's commands straight to the API; the footage shows real counts), "Voice is busy right now" on `/demo` QA states (no Live connection in QA). Do not use those QA screenshots as deck pictures; `npm run shots:deck` makes those. The 10-14 footage still shows the old copy fixed tonight (I-241, I-242, I-244): retake the affected clips (`demo-hero`, `demo-airport`, `kiosk-mirror`, `two-device`, `kiosk-laptop`) before editing the video.

## Ready to submit: what a person still has to do
1. **Decide and fix I-250 before judging** (P1): a timeout on the text agent's model calls and on the phone's chat request, so a hung Gemini call shows "Please try again" instead of "Working…" forever.
2. **Deploy both services together** (I-227, I-104, I-167): `sh scripts/deploy-voice.sh`, then `VOICE_RELAY_URL=wss://<kibo-voice>/ws SHORT_APP_URL=kibo-2026.web.app sh scripts/deploy.sh`; check `/api/health?deep=1` (all `ok`, `liveRelay: ok`).
3. **Publish the repo** (REPO.md): the skill, the worktree gitlinks, `phases/HANDOFF.md`, `docs/plan/STRATEGY.md` and `docs/plan/WIN_PLAN.md` are already untracked (`d0b96c2`, orchestrator); the matching `.gitignore` lines are an uncommitted orchestrator edit in the working tree, left out of this step's commit (R-012): commit them. Then confirm the hooks' origin and the contest start date, confirm `REPO_OWNER` (`csm-kr`), optionally run gitleaks, re-run `npm run scan:repo`, push, make public. Note: the files stay in git history; if they must not be visible at all, publish a fresh history.
4. **Real phones and real people**: Flow A by voice on an iPhone (Safari) and an Android phone (Chrome) on the deployed URL, 3 passes in a row (I-085, A6); 3 touch and 3 voice runs for `evidence/human-runs.json` (`scripts/measure-touch.md`); if possible 5 people 60+ and 3 non-Korean readers (C3).
5. **Video** (≤ 2:50, English captions, public YouTube): retake the clips with the old copy (above), caption the two-line subtitle (I-243), use `videos/footage/2026-10-14/` per `docs/plan/FOOTAGE.md`.
6. **Deck** on the official template, PDF ≤ 5 MB: slides for B5, C4, C9; pictures from `npm run shots:deck` (update `architecture.svg`, I-247); numbers only from `docs/plan/NUMBERS.md` and `DECK_FACTS.md`.
7. **Form**: description from `docs/plan/SUBMISSION.md` (re-run `npm run eval:agent` first and update "68 of 70" if it changes), repo URL, video URL, deployed `/demo` URL.
8. Re-check `models.list` for `gemini-3.8-flash` and `gemini-3.8-live` before the deadline and before judging starts (ADR-011).
