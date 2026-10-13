# Deck facts

Not injected into harness steps (lives under `docs/plan/`). For the deck owner: what each slide of the mandatory template (`docs/plan/SUBMISSION.md` "Deck") may state, and where it comes from. Written 10-13 (10-assets:1).

**Status:** **measured** = a saved result file in the repo; **design** = what the code and docs do (cite the file, not a number); **unverified** = not checked, say so on the slide or leave it out (R-001). Numbers come only from `evidence/*`, `evals/results/*`, `spikes/*/results/*` and the evidence ledger in `docs/TESTING.md`. No OpenAI numbers in public material; no claim of legal compliance; no pricing or sales pitch (T&C).

Pictures: real captures in `docs/assets/deck/` (`npm run shots:deck`, `scripts/deck-shots.ts`). Never mockups.

## 1 Team
| Fact | Source | Status |
|---|---|---|
| Team malo: Sungmin Cho, Ye Seul Ahn; challenge Sustainability & Social Impact | `docs/plan/SUBMISSION.md` "Hard rules", "Form" | design |

## 3 Idea
| Fact | Source | Status |
|---|---|---|
| "Don't learn the kiosk. Just talk." Say one thing to your phone and the existing kiosk fills its own cart | `docs/PRD.md` "Goal" | design |
| For older adults, people with low vision, people who cannot speak easily (text and buttons) and visitors who cannot read Korean | `docs/PRD.md` "Users" | design |
| No app install: scan the kiosk's QR, a web page opens | `docs/PRD.md` "Why the phone"; `src/app/assistant/` | design |
| Korea's barrier-free kiosk requirement (dates, fines, cost) | `docs/PRD.md` "Problem" says "reported; verify the decree text" | **unverified**: leave out until the decree is checked; never say KIBO satisfies it |

## 4 Opportunities
| Fact | Source | Status |
|---|---|---|
| No kiosk replacement and no new hardware: the user's phone brings the mic, speaker and their own settings | `docs/PRD.md` "Why the phone" | design |
| Kiosks without integration are connected by KIBO Learn: learn once with Gemini, then replay orders without AI | `docs/KIBO_LEARN.md`; ADR-007 | design |
| Scope: web and webview kiosks; native kiosk apps are roadmap. Say "existing web kiosks", never "any kiosk" | `docs/PRD.md` "Out of MVP scope"; I-076, I-088 | design |

## 5 Features
| Fact | Source | Status |
|---|---|---|
| QR connect, voice (Gemini Live) or text (Gemini Flash), Korean and English | `docs/ARCHITECTURE.md` "Voice"; `src/lib/agent/` | design |
| 9 agent tools; the whole menu is in the instructions, so one tool call per sentence | ADR-004; `src/lib/agent/tools.ts` | design |
| Live mirror: every change shows on the kiosk with a 2 s highlight and "Added by AI" | `docs/UX.md` A6; `docs/UI_GUIDE.md` "Components" | design |
| Confirm before pay: the AI can open the confirm card but cannot pay; payment needs the user's tap or a new "yes", then the card at the kiosk | ADR-005; `src/lib/commands/machine.ts` (unit-tested in `machine.test.ts`) | design |
| Undo, choice buttons, sold-out alternatives, call staff when the data has no answer (e.g. halal) | `docs/UX.md` "Exception flows" | design |
| Three places in `/demo`: MALO BURGER (35 items, 7 categories), SKYLINE AIRPORT RAIL ticket machine (11 tickets and passes), Doughhouse pizza (10 items, learned) | `data/kiosks/malo.json`, `data/kiosks/airport_rail.json`, `skills/doughhouse.json` | measured (counted in the data) |

## 6 Flow
| Fact | Source | Status |
|---|---|---|
| QR → claim → talk → Gemini function call → `POST /api/command` (zod, actor token, state machine, catalog) → Firestore transaction → SSE → kiosk highlight and phone cart → confirm card → card at the kiosk → order number | `docs/ARCHITECTURE.md` "Sequence diagrams" 1 | design |
| Learned kiosk: the command waits for the in-page bridge, which replays the recipe and checks the kiosk's own total before the session changes | `docs/ARCHITECTURE.md` "Sequence diagrams" 3 | design |

## 7 Wireframes
Real screens, not drawings. MALO hero order (two cheeseburger sets, one without pickles, zero cola and cider).

| Picture | Shows | Status |
|---|---|---|
| `docs/assets/deck/wireframe-phone-P3-talk.png` | Phone talk screen with the two lines and total | measured (capture) |
| `docs/assets/deck/wireframe-phone-P4-confirm.png` | Phone confirm card: total and [Yes, pay now] fixed at the bottom | measured (capture) |
| `docs/assets/deck/wireframe-phone-P6-order-number.png` | Phone order number | measured (capture) |
| `docs/assets/deck/wireframe-kiosk-K1-attract.png` | Kiosk attract screen with the QR | measured (capture) |
| `docs/assets/deck/wireframe-kiosk-K3-menu-ai-added.png` | Kiosk menu inside the 2 s "AI가 담았어요" highlight | measured (capture) |
| `docs/assets/deck/wireframe-kiosk-K6-review.png` | Kiosk order review | measured (capture) |

Phone captures are 390×844 CSS px at 2×; kiosk captures are the 1080×1920 canvas scaled to 1080 px high. Kiosk text is Korean: add English captions on the slide.

## 8 Architecture
| Fact | Source | Status |
|---|---|---|
| Diagram: phone and kiosk → Cloud Run (Next.js app + API, `asia-northeast3`) → Gemini Live, Gemini Flash, Firestore, Secret Manager; SSE back to both screens | `docs/assets/deck/architecture.png` (2400 px) and `.svg`, rendered from the landing page (`src/app/page.tsx`); `docs/ARCHITECTURE.md` "Deployment" | design |
| The phone talks to Gemini Live directly with a one-use ephemeral token whose model, instructions and tools are pinned; no audio passes through our server | ADR-003; `src/lib/agent/live.ts` | design |
| Clients never touch Firestore: the server streams the session over SSE; Firestore rules deny every client read and write | ADR-010 | design |
| Cloud Run `min-instances=1`, `max-instances=3` | ADR-001; `scripts/deploy.sh` | design (deployment unverified: I-086) |

## 9 Technologies
| Fact | Source | Status |
|---|---|---|
| Models: `gemini-3.8-flash` (text agent, thinking `low`), `gemini-3.8-live` (voice) | ADR-011 | design |
| Text agent on the Gemini API key, falling back once per call to Vertex AI on 402, 429 or 5xx | ADR-011; `src/lib/agent/model.ts` | design (fallback unit-tested only, not exercised live) |
| Firestore transactions serialize touch and AI changes at the same moment; idempotent `commandId` | `docs/ARCHITECTURE.md` "`/api/command` processing order" | design |
| Next.js (App Router, TypeScript strict), Playwright, Vitest | `package.json` | design |
| 748 unit tests (747 passed, 1 skipped) on 10-13 | `npm run test` run in 10-assets:1; no saved log | **unverified** as a saved result: re-run and save the output before quoting |

## 10 Cost
| Fact | Source | Status |
|---|---|---|
| One hero order by text: median 90,393 Gemini tokens, **$0.0648** (3 runs, $0.0633–0.0653) | `evidence/cost-per-order.json` (`costUsdPerOrder.text`); TESTING ledger "Cost per session" | measured tokens × official price |
| One hero order by voice: median 91,795 tokens (thoughts on top), **$0.0886** (3 completed runs, $0.0749–0.0993; $0.1085 if the unattributed prompt is billed as audio) | same, `costUsdPerOrder.voice` | measured tokens × official price; voice split assumed (see the ledger) |
| Prices: Gemini API paid tier, read 10-13 from https://ai.google.dev/gemini-api/docs/pricing, valid through 2026-12-31 (they double from 2027-01-01) | `evidence/cost-per-order.json` `prices` | official URL; re-read before submitting |
| The prompt dominates: each call re-reads the instructions with the whole menu (about 9,600 tokens) | same, `text.runs[].calls` | measured |
| Voice: 1 more attempt stalled on turn 1 (kept as a failure); hero cart exact in 2 of 3 completed runs | same, `voice.failedAttempts`; I-139 | measured |

USD only. Do not show KRW without an official exchange-rate source and date. No prices to customers (T&C).

## 11 Snapshots
Real `/demo` at 1920×1080 (2×) after the first sentence of a scenario, sent to real Gemini through `/api/chat`; "What the AI did" lists the real tool calls.

| Picture | Shows | Status |
|---|---|---|
| `docs/assets/deck/snapshot-demo-malo-1920x1080.png` | Burger kiosk, phone and scenario guide after the hero sentence | measured (capture) |
| `docs/assets/deck/snapshot-demo-airport_rail-1920x1080.png` | Airport rail ticket machine after "Two adult tickets to City Center" | usable: the AI's reply offers a window or aisle seat, which is the express ticket's optional `seat` group in `data/kiosks/airport_rail.json` (an earlier note here was a false positive, I-072) |
| `docs/assets/deck/snapshot-demo-doughhouse-1920x1080.png` | Learned pizza kiosk, the bridge entered the line | measured (capture) |
| `docs/assets/deck/snapshot-demo-malo-guide-and-ai-actions.png` | Scenario guide and "What the AI did" close up | measured (capture) |

The model's reply text differs per capture. Read it before using a picture: a reply that offers something not in the kiosk data (seats, popularity) must not go on a slide (I-072).

## 12 Benchmarks
Blind KIBO Learn first (`docs/plan/SUBMISSION.md`).

| Fact | Source | Status |
|---|---|---|
| Blind cafe kiosk (40 items, built by a separate agent, structure unknown to us), Gemini 3.8 Flash: 2 of 3 learning runs finished (10.3 min, 15.1 min); items 40/40; options 22/29 and 21/29 exact | `spikes/blind-kiosk/results/v3run{1,2,3}/learn-stats.json`, `grade.txt`, `grade_fair.txt` | measured; these runs predate the finish gate and coverage audit, say so |
| Blind cafe example orders: 2/5 and 3/5 passed; the rest were refused before running, not mis-ordered | `spikes/blind-kiosk/results/holdout.log` | measured (put it on the limits line) |
| Pizza kiosk, Gemini 3.8 Flash with the finish gate and audit: learned in 4.8 min, 63 turns, 482,553 input tokens; self-test 3/3; audit passed | `spikes/kibo-learn/results/run3/learn-stats.json`, `learn.log` | measured |
| Replay of unseen pizza orders without AI: 4/4 plus 1 rule violation detected, 546–697 ms per order | `spikes/kibo-learn/results/run3/holdout.log` | measured |
| Bridge replay in the app: 68–528 ms per command; a cart edited by hand on the kiosk was caught | `evidence/bridge-replay.json` | measured, one automated run on a laptop |
| Text agent evaluation: 42/42 cases (MALO 32/32, airport rail 10/10), Korean and English; per request median 5.9 s, p90 10.7 s; until the first command median 3.1 s, p90 5.6 s | `evals/results/2026-10-13T07-43.md` | measured; cases written by the KIBO team, not an external benchmark; count-limit type not covered |
| Voice hero order: 6/6 runs; end of speech → kiosk highlight median 1,084 ms (target ≤ 3 s); → first AI audio median 2,070 ms (target ≤ 2 s, missed) | `evidence/voice-e2e.json` | measured, synthetic TTS voice on a laptop, not a real phone |
| Speech recognition with `languageCodes`: Korean key terms 97.1% clean / 95.4% noisy; English 100% / 100% | `spikes/voice-compare/RESULTS.md` | measured, synthetic voices, one run |
| Touch hero order on `/kiosk`, efficient path: 24 taps | `evidence/touch-hero-efficient.json` | measured, taps only (automated, no human time) |
| Touch vs voice, 3 human runs each (taps, utterances, seconds) | `evidence/human-runs.json` | **planned 10/16**: no numbers until the file exists |
| Latency on a real phone; real kiosk tap counts | TESTING ledger | **planned**: leave out |

## 13 Future
| Fact | Source | Status |
|---|---|---|
| More adapters (hospital, ticketing, civil service), native kiosks through OS accessibility APIs, B2B subscription per kiosk and B2G | `docs/PRD.md` "Business model", "Out of MVP scope"; `docs/KIBO_LEARN.md` "Known gaps" | design (roadmap; no pricing on the slide, T&C) |
| KIBO Learn gaps to name: quantity options, navigation recorded as options, conditional groups | `docs/KIBO_LEARN.md` "Known gaps" | design |

## 14 Links
| Fact | Source | Status |
|---|---|---|
| Product: the Cloud Run URL of `/demo` | `README.md` | **unverified** until the first deploy is checked (I-086, I-092) |
| GitHub repo, demo video | — | not yet public (license open, I-089) |

Slots 2, 15 and 16 of the template are not planned in `docs/plan/SUBMISSION.md`; check the template.
