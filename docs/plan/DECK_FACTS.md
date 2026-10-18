# Deck facts

Not injected into harness steps (lives under `docs/plan/`). For the deck owner: what each slide of the mandatory template (`docs/plan/SUBMISSION.md` "Deck") may state, and where it comes from. Written 10-13 (10-assets:1); updated 10-17 for the worldwide framing, the own-phone `/demo` (ADR-013), voice until payment and the ticket machine's 日本語 screen.

**Status:** **measured** = a saved result file in the repo; **design** = what the code and docs do (cite the file, not a number); **sourced** = an outside fact with its S-id in `docs/plan/SOURCES.md`; **unverified** = not checked, say so on the slide or leave it out (R-001). Numbers come only from `evidence/*`, `evals/results/*`, `spikes/*/results/*` and the evidence ledger in `docs/TESTING.md`. No OpenAI numbers in public material; no claim of legal compliance; no pricing or sales pitch (T&C).

Words never to use on a slide: "any kiosk", "anyone", "first", "only" (as in "the only …"), "payment commands" (the safety number is "37 of 37 forged commands refused"), "multilingual" without the list (`docs/plan/SOURCES.md` "Claims we do not make").

**Sections are template slots, not deck pages.** The final deck has 28 pages (10-17; slide map in `videos/deck-final/NOTES.md`, git-ignored): slot 1 is page 01, 3 is 03, 4 is 04 and 05, 5 is 06 and 07 (07 is the languages page, new on 10-17), 6 is 08, 7 is 09, 8 is 10, 9 is 11, 10 is 12, 11 is 13, 12 is 14 to 16, 13 is 17 and 18, 14 is 19, 15 is 20, then the appendix A1 to A7 (pages 21 to 27) and slot 16 on page 28. Page 02 (the problem statement) is an extra page with no slot here.

Pictures: real captures in `docs/assets/deck/` (`npm run shots:deck`, `scripts/deck-shots.ts`). Never mockups. All retaken 10-14 (14-final:8) from the local production build of the final UI, each under 600 KB; video stills are in `videos/footage/2026-10-14/` (git-ignored, `docs/plan/FOOTAGE.md`).

## 1 Team
| Fact | Source | Status |
|---|---|---|
| Team malo: Sungmin Cho, Ye Seul Ahn; challenge Sustainability & Social Impact | `docs/plan/SUBMISSION.md` "Hard rules", "Form" | design |

## 3 Idea
| Fact | Source | Status |
|---|---|---|
| "Don't learn the kiosk. Just talk." Say one thing to your phone and the existing kiosk fills its own cart | `docs/PRD.md` "Goal" | design |
| For older adults, people with low vision, people who cannot speak easily (text and buttons) and travellers who cannot read the kiosk's language (in the demo, Korean) | `docs/PRD.md` "Users" | design |
| The problem is worldwide; these are context for the groups, none of them a kiosk figure: by 2030, 1 in 6 people in the world will be 60 or over (WHO, 2025); at least 2.2 billion people have a near or distance vision impairment (WHO, 2026); an estimated 1.52 billion international tourist arrivals in 2025 (UN Tourism; say "estimated", and never put it beside the 1.4 billion that another UN Tourism page gives for 2024) | `docs/plan/SOURCES.md` S44, S45, S46 (publisher links there; read 10-16) | sourced |
| Korea is one example: 17.9% of people aged 65+ say they can order or check in at a kiosk (self-reported; KIHASA 2024, re-analysis of the 2023 Survey of Older Koreans) | `docs/plan/SOURCES.md` S16 (p. 32, Table 5) | sourced |
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
| QR connect, voice (Gemini Live) or text (Gemini Flash). **People:** the AI talks and writes in 9 languages (Korean, English, Japanese, Chinese (Simplified), Spanish, Vietnamese, French, Thai, Indonesian), each answering a typed turn on both voice paths (18/18, 14-final:4); spoken input tested in English, Korean and Japanese (synthetic voices on a laptop; Japanese: 3 recorded runs on production, cart right 3/3, reply language wrong 1/3, I-377); the six other AI-only languages not tested by speech. **Screens:** the phone in Korean or English; the kiosk in Korean and English; 日本語 on the airport rail ticket machine (4b2652e, next row). Deck page 07 ("Talk in your language. The kiosk keeps its own.") uses this row | `docs/plan/NUMBERS.md` "Languages"; `docs/ARCHITECTURE.md` "Voice"; `src/lib/agent/`; `evidence/live-languages.json`; `evidence/voice-e2e.json`; `docs/ISSUE.md` I-377; `docs/plan/SOURCES.md` G1b | measured (typed: 9 languages; spoken: en, ko in the evidence files, ja in the NUMBERS.md row); the six others not tested by speech |
| **The ticket machine's 日本語 screen:** SKYLINE AIRPORT RAIL's start screen offers 한국어 · English · 日本語 for the order, and every kiosk screen from the start to the reference number is then Japanese, with prices in won ("10,500ウォン"). A kiosk screen language: the phone keeps its own language, the AI gets the Korean and English names, and KIBO's English lines (the subtitle under the AI banner, the `/demo` caption step) stay English. In production since `kibo-00024-bzf` (10-16); the video shows an English voice order filling the Japanese screen. Known gaps: the English step line names the Korean payment buttons (I-389); the kiosk's error bar has no Japanese and shows English (I-390); the banner keeps "Working…" while Gemini Live speaks (I-394) | `data/kiosks/airport_rail.json` (`locales`, `ja` names); `e2e/kiosk-rail-ja.spec.ts`; `docs/UX.md` "Language" | design (E2E-tested) |
| 10 agent tools (`showMenu` added 10-18, so a voice "show me the drinks" moves the kiosk); the whole menu is in the instructions, so one tool call per sentence | ADR-004; `src/lib/agent/tools.ts` | design |
| Live mirror: every change shows on the kiosk with a 2 s highlight and "Added by AI" | `docs/UX.md` A6; `docs/UI_GUIDE.md` "Components" | design |
| Confirm before pay: the AI can open the confirm card but cannot pay; payment needs the user's tap or a new "yes", then the card at the kiosk | ADR-005; `src/lib/commands/machine.ts` (unit-tested in `machine.test.ts`) | design |
| Undo, choice buttons, sold-out alternatives, call staff when the data has no answer (e.g. halal) | `docs/UX.md` "Exception flows" | design |
| Three places in `/demo`: MALO BURGER (35 items, 7 categories), SKYLINE AIRPORT RAIL ticket machine (11 tickets and passes), Doughhouse pizza (10 items, learned) | `data/kiosks/malo.json`, `data/kiosks/airport_rail.json`, `skills/doughhouse.json` | measured (counted in the data) |

## 6 Flow
| Fact | Source | Status |
|---|---|---|
| `/demo` with the judge's own phone (the default since 10-16): [Start] makes the laptop the kiosk, which it shows alone with its QR and 6-digit code; the judge scans the QR with their own phone and talks; payment is on the kiosk's own 카드 (Card) → 카드 넣기 (Insert card). [Try it on this screen] opens the three-column view (the kiosk, a phone drawn beside it, Scenarios and "What the AI did") for a judge without a phone at hand | ADR-013; `docs/UX.md` C1, C1a; `src/components/demo/DemoIntro.tsx` | design |
| Voice until payment: the dine option, the order, "That's all, I'll pay." (`requestCheckout`, the review opens on both screens) and "Yes, pay now." (`confirmCheckout`, accepted from the AI on a new user utterance at least 1.5 s after the review opened); the card stays two taps on the kiosk | ADR-005; `isConfirmed` in `src/lib/commands/machine.ts` | design |
| QR → claim → talk → Gemini function call → `POST /api/command` (zod, actor token, state machine, catalog) → Firestore transaction → SSE → kiosk highlight and phone cart → confirm card → card at the kiosk → order number | `docs/ARCHITECTURE.md` "Sequence diagrams" 1 | design |
| Learned kiosk: the command waits for the in-page bridge, which replays the recipe and checks the kiosk's own total before the session changes | `docs/ARCHITECTURE.md` "Sequence diagrams" 3 | design |
| The phone flow, **deployed as `kibo-00025-cwl` on 10-17**: after the QR the phone lands on the mic screen and the AI greets first (I-400); the AI's choice buttons show before the dine option (I-395); a choice is asked once per utterance (I-397); "pay in cash" gets card only and [Call staff] (I-398); a refused command tells the model which field failed (I-396) | `docs/ISSUE.md` I-395 to I-400 | design; put it on a slide only after the deploy, and recapture the pictures from production |

## 7 Wireframes
Real screens, not drawings. MALO hero order (two cheeseburger sets, one without pickles, zero cola and cider).

| Picture | Shows | Status |
|---|---|---|
| `docs/assets/deck/wireframe-phone-P3-talk.png` | Phone talk screen with the two lines and total | measured (capture) |
| `docs/assets/deck/wireframe-phone-P4-confirm.png` | Phone confirm card: total and [Yes, pay now] fixed at the bottom | measured (capture) |
| `docs/assets/deck/wireframe-phone-P6-order-number.png` | Phone order number | measured (capture) |
| `docs/assets/deck/wireframe-kiosk-K1-attract.png` | Kiosk attract screen with the QR, the short address `kibo-2026.web.app` and the 6-digit code | measured (capture) |
| `docs/assets/deck/wireframe-kiosk-K3-menu-ai-added.png` | Kiosk menu inside the 2 s "AI가 담았어요" highlight, with KIBO's English subtitle row ("AI added: …") | measured (capture) |
| `docs/assets/deck/wireframe-kiosk-K6-review.png` | Kiosk order review | measured (capture) |
| `videos/footage/2026-10-14/two-device-1440x900--phone--06-paying.png`, `two-device-1440x900--06-paying.png` | The pay step (I-146): the phone says "Insert your card into the kiosk", the laptop kiosk shows its payment screen and the step in English | measured (footage still) |
| `videos/footage/2026-10-14/two-device-1440x900--phone--02-code-typed.png` | Connecting without a camera: the kiosk's 6-digit code typed on the phone's `/app` | measured (footage still) |

Deck page 07 shows the ticket machine's 日本語 screen from the video v4 take m5-t1 (English voice → 日本語 ticket machine, production `kibo-00024-bzf`, 10-16): a real recorded frame, never a mockup.

Phone captures are 390×844 CSS px at 2×; kiosk captures are the 1080×1920 canvas scaled to 1080 px high. Kiosk text is Korean: add English captions on the slide (the K3 subtitle row already carries one). In the K3 picture the second cart chip is cut at the right edge (a sideways-scrolling row, I-244) and the subtitle names only the second set (I-243): crop above the cart bar or caption it.

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
| 1,082 unit tests (1,081 passed, 1 skipped) on 10-14 | `npm run test` run in 14-final:8; no saved log | **unverified** as a saved result: re-run and save the output before quoting |

## 10 Cost
| Fact | Source | Status |
|---|---|---|
| One hero order by text: median 57,778 Gemini tokens, 55,314 of them read from the explicit prompt cache, **$0.0080** before cache storage (3 runs, $0.0071–0.0086; 10-14, final code, text agent on Vertex AI priced at the Gemini API list prices) | `evidence/cost-per-order.json` (`costUsdPerOrder.text`); `docs/plan/NUMBERS.md` | measured tokens × official Gemini API price; Vertex AI price not read (unverified); storage not included |
| Prompt cache: text input cost per hero order **85% lower** ($0.0588 → $0.0088 on 10-13, same day, on the API key), **no latency gain**; storage price not on file, so say "before storage". Do not pair the 85% with the 10-14 $0.0080: different day and backend | `evidence/prompt-cache.json` | measured; storage price **unverified** |
| One hero order by voice: median 93,661 tokens (thoughts on top), **$0.0885** (3 runs, $0.0785–0.1050; $0.1084 if the unattributed prompt is billed as audio; 10-14, fixed fixtures); Live cannot use the prompt cache | same, `costUsdPerOrder.voice` | measured tokens × official price; voice split assumed (see the ledger) |
| Prices: Gemini API paid tier, read 10-13 from https://ai.google.dev/gemini-api/docs/pricing, valid through 2026-12-31 (they double from 2027-01-01) | `evidence/cost-per-order.json` `prices` | official URL; re-read before submitting |
| The prompt dominates: each call re-reads the instructions with the whole menu (about 9,600 tokens); the text agent now reads them from the cache | same, `text.runs[].calls` | measured |
| Voice cost runs: hero cart exact in 2 of 3 (attempt 1 ended with another cart); in 2 runs the model called `confirmCheckout` right after opening the review and the server refused it | same, `voice.runs` | measured; a good "the AI cannot pay" example, from a script, not the phone |

USD only. Do not show KRW without an official exchange-rate source and date. No prices to customers (T&C).

## 11 Snapshots
Real `/demo` at 1920×1080 (2×) after the first sentence of a scenario, sent to real Gemini through `/api/chat`; "What the AI did" lists the real tool calls. These show the three-column view, which `/demo` has opened behind [Try it on this screen] since 10-16; [Start] shows the kiosk alone and the judge's own phone (ADR-013), so caption a three-column picture "Try it on this screen".

| Picture | Shows | Status |
|---|---|---|
| `docs/assets/deck/snapshot-demo-malo-1920x1080.png` | Burger kiosk, phone and scenario guide after the hero sentence | measured (capture) |
| `docs/assets/deck/snapshot-demo-airport_rail-1920x1080.png` | Airport rail ticket machine after "Two adult tickets to City Center" | usable: the AI's reply offers a window or aisle seat, which is the express ticket's optional `seat` group in `data/kiosks/airport_rail.json` (an earlier note here was a false positive, I-072) |
| `docs/assets/deck/snapshot-demo-doughhouse-1920x1080.png` | Learned pizza kiosk (our development kiosk, restyled), the bridge entered the line; KIBO's strip under it names the taps and "kiosk total 23,400원 ✓ matches" | measured (capture); the page is drawn about 0.5× in `/demo`, so let KIBO's strip, the phone and "What the AI did" carry the slide (R-013) |
| `docs/assets/deck/snapshot-demo-malo-guide-and-ai-actions.png` | Scenario guide and "What the AI did" close up | measured (capture) |
| `videos/footage/2026-10-14/learned-replay-1440x900--03-tapping.png`, `--04-matches.png` | `/learned/doughhouse` at 1440×900 (page about 0.8×): a numbered tap mark mid-replay, then the verified line | measured (footage still) |
| `videos/footage/2026-10-14/demo-lang-<code>-1920x1080--02-reply.png` | The Korean kiosk with the phone's AI answering in Japanese, Chinese, Spanish, Vietnamese, French, Thai or Indonesian (typed) | measured (footage still); say "typed" for these stills. Spoken input is tested in English, Korean and Japanese (synthetic voices on a laptop; Japanese: 3 runs, cart right 3/3, reply language wrong 1/3, I-377; `docs/plan/NUMBERS.md` "Languages"); the six other AI-only languages are not tested by speech |

The model's reply text differs per capture. Read it before using a picture: a reply that offers something not in the kiosk data (popularity or taste words, a choice the item has no option group for) must not go on a slide (I-072).

The "What the AI did" rows show `0 ms` and `1 ms`: the captures run on the in-memory store on a laptop, so that is the command alone, not production latency. Do not quote them; cut or caption them "local test" (I-145). Latency numbers come only from slot 12.

## 12 Benchmarks
Blind KIBO Learn first (`docs/plan/SUBMISSION.md`).

| Fact | Source | Status |
|---|---|---|
| **Never-seen kiosks, latest learner (lead with this):** round 4, two kiosks built by separate AI agents (snack bar, chicken shop), learner frozen first, learned once each (9.6 and 14.2 min), items 62/62. Say it word for word: **"On two kiosks it had never seen, KIBO handled all 20 test orders safely: 16 finished hands-free, 4 stopped safely (2 handed to staff, 2 refused), and none was wrong (round 4, synthetic kiosks)."** Where a big number is shown: **"20/20 safe · 0 wrong"** with "16 hands-free · 4 stopped safely (2 to staff, 2 refused)" under it, so the staff hand-offs sit beside the number (R-014). The 2 handed to staff are the orders where the skill's own total differed from the kiosk's (grader: 18 correct / 2 refused / 0 unsafe; the app's bridge stops a total mismatch and calls staff); learning cost $0.79 for both. If asked about options: the chicken kiosk's learned option lists matched its answer key exactly for only 2 of its 14 items with options (34 of 39 option groups found; +500원 sauces and a +1,000원 flavour recorded at 0원, the set's cola upgrade left out), which explains the 2 handed to staff and the 2 refused | `spikes/blind-kiosks/ROUND4.md`; `results/bk{9-bunsik,10-chicken}/final/grade-v2.json`; `evidence/learn-cost.json` | measured, synthetic kiosks, one run each |
| **Exception tests (round 4): 4 of 4 stopped safely.** 2 caught a hidden ₩500–3,000 charge by checking the kiosk's own total, and 2 refused an option the skill did not know, before touching the kiosk. bk10 h1 (boneless fried chicken, 2 sauces, cola): kiosk ₩22,500, skill ₩22,000, the second sauce's ₩500 not visible while learning → the app's bridge stops and calls staff (the phone must never show a price the kiosk will not charge); h6 (honey butter chicken ×3, 3 sauces each): ₩63,000 vs ₩60,000 → stops, staff; h3 and h10 (chicken sets with the "콜라 1.25L 변경" upgrade the skill does not have) → refused before the first tap, nothing touched the kiosk (guessing an unknown option could order the wrong thing). The grader counts h1 and h6 correct (cart lines and kiosk total match the key); the stop is the app's bridge (R-014) | `spikes/blind-kiosks/results/bk10-chicken/final/grade-v2.json` (h1, h6, h3, h10: `kioskTotal`, `skillPredicts`, `totalCannotSee`, `reason`); `docs/KIBO_LEARN.md` "Exception tests (round 4)" | measured, one run; the bridge's stop is the app's rule, not run on bk10 |
| **Every never-seen kiosk so far (say it next to the headline):** rounds 2–4, 6 kiosks, each new to that round's learner: 60 orders, 32 correct / 15 refused / **3 unsafe** (round 2: the food court's three take-out orders, 100원 below the key; an optional bag on the order review that the grader did not ask for, I-195, I-229) / 10 not learned (bk8, two attempts); skill total ≠ kiosk total in 6 of 35 | `spikes/blind-kiosks/ROUND4.md`, `ROUND3.md`, `RESULTS.md` | measured; never add the test kiosks or Doughhouse into it |
| Four test kiosks, learner before → after the improvements: finished 2 → 4 of 4; items 57 → 134 of 134; 40 unseen orders correct 5 → 31, **unsafe 5 → 5** (the final 5: the bakery's timeout modal, I-193); in the final the skill's own total differed from the kiosk's in 3 of the 31 orders that reached one (I-197); cost for all four $5.22 → $1.49 | `spikes/blind-kiosks/RESULTS.md`; `spikes/blind-kiosks/results/bk*/{baseline,final}/grade-v2.json` | measured; not a clean blind result for the final (the learner was improved from these kiosks' baseline failures); cost = tokens × Gemini API price, the learner ran on Vertex (price unverified) |
| Pizza kiosk (our development kiosk, not blind), newest run, round 3 learner: learned in 5.2 min, 35 turns, 347,025 input tokens | `spikes/blind-kiosks/results/dev/gemini-doughhouse-round3/learn-stats.json` | measured |
| Replay of unseen pizza orders without AI, same run: 4/4 plus 1 planted rule violation detected, 1.6–2.2 s per order (offline runner with the review check) | `spikes/blind-kiosks/results/dev/gemini-doughhouse-round3/holdout.log` | measured |
| Bridge replay in the app: 73–645 ms per command (350 ms per tap pause for people not included); a cart edited by hand on the kiosk was caught | `evidence/bridge-replay.json` | measured, one automated run on a laptop |
| Text agent evaluation: 80/82 cases (MALO 65/67, airport rail 12/12, Doughhouse 3/3; typed in Korean, English and 7 more languages); per request median 4.9 s, p90 7.8 s; until the first command median 2.3 s, p90 4.4 s; backend `auto` as in production (the Gemini API key answered every call), 10-15, final code | `evals/results/2026-10-15T09-56.md` | measured; cases written by the KIBO team, not an external benchmark; count-limit type not covered |
| Typed hero order on the deployed service: a full order sentence (two sets in one message) median 4.5 s (4 turns, 4.4–4.9 s); short follow-ups median 2.3 s (8 turns, 2.0–2.6 s); all 12 turns median 2.3 s, p90 4.5 s. Never show the all-turn median alone: it is not the wait for a full order | `evidence/prod-latency.json` | measured, one run from Seoul, revision `kibo-00019-rmt`, 10-15 |
| Forged commands: 37 of 37 refused with the documented status; 5 of 5 legitimate controls accepted | `evidence/forged-commands.json` | measured on a local production build |
| Voice hero order: 4/4 runs direct, end of speech → kiosk highlight median 1,669 ms (target ≤ 3 s); → first AI audio median 2,382 ms (target ≤ 2 s, missed); Vertex AI relay 4/4 (relay run locally, not on Cloud Run), 1,715 / 2,841 ms. All attempts on record: 40, 28 passed, 6 upstream failures (I-104), 2 model failures (I-115, I-251), 4 failures in two later runs (I-272; counts in NUMBERS.md) | `evidence/voice-e2e.json`, `evidence/voice-e2e-relay.json` | measured, synthetic TTS voice on a laptop, not a real phone; earlier 6/6 and 1,084 ms came from fixtures with a click and noise tail (I-237), and 1,833 / 2,708 ms (2 runs) were replaced by the files' 4 runs (NUMBERS.md "Retired numbers"), do not quote |
| Speech recognition with `languageCodes`: Korean key terms 97.1% clean / 95.4% noisy; English 100% / 100% | `spikes/voice-compare/RESULTS.md` | measured, synthetic voices, one run |
| Touch hero order on `/kiosk`, efficient path: 24 taps, counted as the kiosk's demo counter counts (from 매장에서 먹기 to 카드 넣기: the attract tap is not counted and the count stops at paid, so the receipt question after payment is not counted either) | `evidence/touch-hero-efficient.json`; `countTap` in `src/components/kiosk/KioskScreen.tsx` | measured, taps only (automated, no human time) |
| **Touch vs talk, as the video says it:** "24 taps vs 3 sentences · 2 taps", with its rule beside it: "Counted until the card is paid, on both sides. Not counted: waking the kiosk; scanning the QR and turning on the mic." Talk side: "Two cheeseburger sets for here, with large fries: one zero cola, no pickles, the other a cider." → "That's all, I'll pay." → "Yes, pay now." (the AI confirms on the new utterance), then 카드 and 카드 넣기 on the kiosk; phone taps after setup 0 (Start and the mic not counted); the same order as the touch path, order 259, ₩14,800. Deck page 13 carries it as the touch-vs-voice strip | Touch: row above. Talk: `evidence/voice-only-hero.json` (`counts`, `commands`, `taps`); `docs/plan/NUMBERS.md` "Voice-only hero order (recorded take)" | touch measured (automated); talk measured, **one recorded take** on production `kibo-00023-hth` (10-16, synthetic Gemini TTS voice on a laptop Chromium phone, not a human timing): on a slide say "one recorded take", keep the counting rule beside it and show no times |
| Touch vs voice, 3 human runs each (taps, utterances, seconds) | `evidence/human-runs.json` | **planned**: no numbers until the file exists |
| Latency on a real phone; real kiosk tap counts | TESTING ledger | **planned**: leave out |

## 13 Future
| Fact | Source | Status |
|---|---|---|
| More adapters (hospital, ticketing, civil service), native kiosks through OS accessibility APIs, B2B subscription per kiosk and B2G | `docs/PRD.md` "Business model", "Out of MVP scope"; `docs/KIBO_LEARN.md` "Known gaps" | design (roadmap; no pricing on the slide, T&C) |
| KIBO Learn gaps to name: quantity options, navigation recorded as options, conditional groups | `docs/KIBO_LEARN.md` "Known gaps" | design |

## 14 Links
| Fact | Source | Status |
|---|---|---|
| Product: https://kibo-407514467119.asia-northeast3.run.app/demo (the Cloud Run service `kibo`, `asia-northeast3`; production revision `kibo-00026-5cz` on 10-18, relay `kibo-voice-00006-g5x`) | `README.md`; `gcloud run services describe kibo --region asia-northeast3` | deployed (host confirmed 10-14, I-092); the revision changes with each deploy, so read it again before quoting it |
| GitHub repo, demo video | — | not yet public (license open, I-089) |

Slots 2, 15 and 16 of the template are not planned in `docs/plan/SUBMISSION.md`. In the final deck slot 2 (download instructions) is removed, slot 15 is the Impact page (20) and slot 16 the thank-you page (28).
