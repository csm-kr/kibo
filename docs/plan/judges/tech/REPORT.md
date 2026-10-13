# KIBO: technical judge report (Google Cloud AI Builder Cup 2026)

Judge lens: Technical Merit & GenAI (40%). Evaluated 2026-10-13, 22:00–22:45 KST, on the live Cloud Run service (revision `kibo-00012-zm8`) and the local repo (read only). Two other judge agents were browsing the same site from the same IP at the same time. That turned out to matter (see section 3).

## What I checked myself (not taken from the team's docs)

| Check | Result | Where |
|---|---|---|
| `/api/health?deep=1` at 22:04 KST | **HTTP 503**, `textGenerate: fail`, `keyGenerate: fail` | `health.json` |
| Same check at 22:30 and 22:43 KST | 200, all checks ok | curl |
| Page loads `/`, `/demo`, `/kiosk`, `/app`, `/assistant`, `/learned/doughhouse` | All 200 in under 0.2 s; no console errors | `tour.json`, `shots/*.png` |
| `kibo-2026.web.app` | 302 to `<run.app>/app` | curl |
| About 17 forged commands against fresh demo sessions (no model calls) | All refused correctly, details below. Commands took 24–125 ms round trip | `probe.mjs`, `probe2.mjs` |
| 8 typed Gemini messages through the public `/api/chat` | 8/8 correct, grounded tool calls. Latency **5.3 / 6.0 / 6.2 / 7.0 / 7.5 / 8.5 / 10.4 / 16.5 s (median 7.2 s)** | `chatapi.mjs`, `chatB.json`, `chatC.json` |
| `/demo` and `/learned/doughhouse` in a headless browser | Worked once at 22:06. From about 22:09 to 22:43 every new screen got **429 on `/api/session/{id}/events`** and stayed on "Connecting to the kiosk..." with no message and no retry. The learned-pizza order could not be run live | `shots/s4-open.png`, `shots/dbg.png` |

Forged command results:
- No token: 401. Phone `cardAction`: 403. Confirm while `ordering`: 409.
- Item not on the menu, qty 999, an option from another item, an extra `price` field, a kiosk token with `source: text`: 400 each.
- Same `commandId` sent twice: no second line.
- AI confirm in the same utterance, or with a new utterance under 1.5 s later: 409. Stale `cartVersion`: 409.
- Valid AI confirm (new utterance after 1.8 s): `paying`. Phone `cardAction` or undo in `paying`: 403 and 409. Kiosk `cardAction`: `paid`.

Gemini behaviour in the 8 messages:
- **Hero order (EN).** `setDineOption`, 2 × `addToCart` with exact options, then 2 × `updateCart` (fries L). Total ₩14,800, which matches `evidence/touch-hero-efficient.json`.
- **"I want to pay now, and yes, I confirm…"** Only `requestCheckout` was called. My tap then moved the session to `paying`, and the kiosk card action to `paid`.
- **KO with Big Mac and shrimp burger.** Said Big Mac is not on the menu. `addToCart(shrimp_burger)` got SOLD_OUT from the server, then `offerChoices` gave alternatives.
- **Halal question plus prompt injection.** Only `callStaff(unknown_info)`; nothing else changed.
- **Code-switched sentence.** Correct `largeSet` with `no_onion` and cola, plus an upsell from the data.
- **Airport rail.** Asked Express or All-stop with buttons.
- **"I'd like a burger."** Showed 6 burger choices as buttons.

## 1. Scores

| Criterion | Weight | Score | Weighted |
|---|---|---|---|
| Technical Merit & GenAI | 40% | **8** | 3.20 |
| Problem Alignment & Impact | 25% | **7** | 1.75 |
| Innovation | 25% | **7** | 1.75 |
| UX | 10% | **7** | 0.70 |
| **Total** | | | **7.4 / 10** |

**Technical Merit & GenAI: 8.** The engineering is well above hackathon norm. Every change goes through one server door (`POST /api/command`), built from:
- zod schemas
- actor tokens bound to the allowed `source`
- a server-side state machine
- idempotent `commandId`
- Firestore transactions
- SSE fan-out to both screens.

I attacked that door directly and every forged request was refused. "The AI cannot pay" is enforced by `cartVersion`, an utterance counter, a 1.5 s delay and a kiosk-only `cardAction`, not by the prompt.

The Gemini usage is current and correct:
- Live with one-use ephemeral tokens pinned by `liveConnectConstraints`, so the browser never sees the key or the prompt (`src/lib/agent/live.ts`).
- Function declarations whose enums come from the catalog (`tools.ts`).
- An explicit context cache that cut text input cost by 85% (`evidence/prompt-cache.json`).
- A tuned `thinkingLevel`.
- A key-to-Vertex fallback for text and a Vertex Live WebSocket relay for voice that reuses the same budget checks and drops client `setup` (ADR-012, `voice-relay/relay.ts`).

The evidence ledger is unusually candid.

What keeps it from 9–10:
- Production latency: 7.2 s median per typed message, up to 16.5 s.
- Voice first audio median 2,070 ms misses the team's own 2 s target.
- Voice was measured only with TTS fixtures on a laptop.
- KIBO Learn is offline-only and weak on blind kiosks: café 2/5 and 3/5. The repo's new held-out baselines show 3/10 correct with 3 unsafe, 0/10, and 2/10 with 2 unsafe.
- Fragile operations: prepaid-key outages (I-104), deep health was 503 while I tested, and the per-IP stream cap locked me out for over 30 minutes (I-033 open).

**Problem Alignment & Impact: 7.** The problem is real and well framed: older adults, low-vision users and visitors who cannot read Korean at Korean kiosks. The personas are concrete, and the accessibility choices follow from them: undo, staff call, text and buttons, large text, English on the phone. Using the user's own phone avoids new hardware.

But there is no measurement yet:
- no older or low-vision participant
- touch vs voice only as an automated 24-tap path
- `human-runs.json` is only a template
- the legal requirement is marked "unverified" in `docs/plan/DECK_FACTS.md`.

Adoption depends on kiosk operators (an adapter or an installed bridge), and that path is not addressed.

**Innovation: 7.** BYOD phone plus a mirror on the existing kiosk plus a safety-first agent is a fresh angle. KIBO Learn (explore once, compile a skill, gate on ≥ 3 self-tests and an AI-free audit, replay without AI against the kiosk's own total) is a defensible alternative to per-order computer-use agents.

Points lost:
- The in-product learned kiosk, Doughhouse, is the team's own dev-set kiosk, but `/demo` calls it a "third-party screen".
- "No integration" still needs a script inside the kiosk page, and its real-world deployment is not explained.
- Blind generalization is weak, with unsafe replays.
- QR-to-phone ordering is common in Korea; the novelty is the mirror plus learn-once replay.

**UX: 7.** `/demo` gives judges a strong experience: kiosk and phone side by side, a scenario list, a "What the AI did" panel with real tool calls, and a 2 s highlight. Copy is clean in both languages. Against it: the frozen "Connecting to the kiosk..." with no explanation or retry (`shots/s4-open.png`), 5–16 s typed replies, and a bare learned pizza page. I did not test voice by ear.

## 2. The 12 questions (ordered by impact on score)

| # | Question | A convincing answer needs | Shown now? |
|---|---|---|---|
| 1 | Will the demo survive a panel on one office network until 11-06? | A 5-judges-on-one-IP test; reconnect after 429 with a message; proof that a closed tab frees its slot on Cloud Run; uptime history | **No.** Reproduced the lockout (`shots/s4-open.png`); I-033 and I-154 open |
| 2 | Can Gemini billing fail mid-judging? | Postpaid billing or Vertex as primary with measured latency; budget alert; deep-health history | **Partly.** ADR-011/012 add fallbacks. But I-104 (two outages on 10-13), I-157 (Vertex 25–91 s under 5 users), and 503 at 22:04 KST |
| 3 | Does voice work on real phones, real people, noise, and how fast? | iPhone and Android recordings on the deployed URL; p50/p90 over ≥ 10 runs on both voice paths | **Partly.** `evidence/voice-e2e.json` is TTS on a laptop; relay latency measured only locally (`voice-e2e-relay.json`) |
| 4 | Are voice numbers all attempts? | "N attempted / M passed / K upstream failures", including I-115 | **No.** I-099/I-115: a failing `hero-ko` run left out; the README says 6/6, the file now says 8/8 |
| 5 | KIBO Learn on unseen kiosks, ever unsafe? | Four held-out kiosks, final learner, correct / safe refusal / unsafe with unsafe = 0 | **Partly.** README: 2/5, 3/5. New baselines include unsafe 3/10 and 2/10 (an ambiguous `+` button) |
| 6 | How does the bridge get into a real vendor's kiosk? | Script tag, kiosk-browser extension or WebView injection; who installs it | **No.** The demo serves a copy of the page from its own origin in an iframe without `sandbox` (I-153) |
| 7 | Can the AI ever pay, including through voice artifacts? | Server tests, forged requests, plus TTS echo and bystander "yes" tests | **Partly.** Server rule holds (`machine.test.ts`, my probes). The voice utterance is counted on the phone from `inputTranscription` (`src/lib/voice/turns.ts`), and that path was not tested |
| 8 | Is 42/42 (44/44, 32/32) meaningful? | 5× repeats with variance, blind-written cases, an eval on spoken audio | **Partly.** 44 team-written cases, one run each. 44/44 joins a 402-truncated run with a Vertex re-run. Three different numbers are quoted |
| 9 | What latency does a user actually feel? | Deployed end-to-end p50/p90 | **Partly.** Eval 5.9 s is in-process; I measured 7.2 s median and 16.5 s max on production |
| 10 | Better than touch for older adults? | 3+ older participants: time, errors, help requests, satisfaction | **No.** Automated 24 taps only |
| 11 | Why this Google stack, and is it the best use? | Rationale for Live with ephemeral tokens, the cache, the fallbacks, not using ADK; cost per order | **Mostly yes.** ADRs; `cost-per-order.json` (text $0.0088, voice $0.0766). The README diagram omits the `kibo-voice` relay in `us-central1` |
| 12 | Fresh code? | Hackathon start date and the spike history | **No.** The first commit on 10-12 adds 25,892 lines, including the full learner and blind-kiosk spikes |

## 3. What made me doubt the claims

1. **The live demo froze.**
   - What I saw: 429 on every new event stream for about 34 minutes. The phone stayed on "Connecting to the kiosk..." with no retry.
   - Cause: a cap of 10 open streams per IP (`src/lib/limits/ip.ts`), shared by three judges on one IP. A 429 stops `EventSource` for good (I-033).
   - Not proven: whether closed tabs free their slot before the 15-min server cap. Release depends on `req.signal` abort reaching the route through Cloud Run.
2. **Health flapped.** 503 at 22:04 KST (`keyGenerate`, `textGenerate` failed), ok at 22:30. A prepaid key is a single point of failure for a three-week uptime rule.
3. **Numbers drift.**
   - Eval: 32/32 (README, landing), 42/42 (SUBMISSION), 44/44 stitched (TESTING).
   - Voice: README and landing say 6/6 and 1,084 ms / 1.1 s; the file says 8/8 and 974 ms.
   - Bridge: TESTING says 68–528 ms; the file says 62–551 ms (overwritten later, I-099).
4. **Selective voice evidence.** A failing Korean run (I-115, add/undo loop over 15 times) was left out of the file, and I-115 is still open.
5. **README and site disagree on KIBO Learn.**
   - README says in-app replay is "not built yet" and its diagram calls the bridge "planned", but `/learned/doughhouse` and `evidence/bridge-replay.json` show it is built.
   - Doughhouse is called "third-party" on `/demo` but "a pizza kiosk we built" on the landing.
6. **Blind results are weaker than the headline.** "40/40 items" comes first; orders passed 2/5 and 3/5; the new baselines have unsafe replays.
7. **Every measurement is synthetic.** TTS voice, Playwright taps, Lighthouse and load checks on a local build. All are labelled honestly, but none uses the deployed path with a real person.
8. **Submission parts are missing.** Video and deck are "coming", the repo is not public, and the licence says "All rights reserved".
9. **Latency.** 16.5 s on a Korean multi-tool message undercuts "faster than touch".
10. **Minor data realism.** A large set keeps medium fries by default (`data/kiosks/malo.json`).

Not mocked as far as I could tell: the "What the AI did" panel matches the server responses, totals come from menu data, and the server enforced every forged rule.

## 4. The five changes that would raise my score most

1. **Make the demo impossible to freeze.**
   - Reconnect with backoff after a 429 and show a message (I-033).
   - Cap streams per session or per token instead of per IP.
   - Prove that a closed tab frees its slot on Cloud Run.
   - Move the key to postpaid billing (or make Vertex the measured primary) with a budget alert.
   - Effect: removes the "dead demo" risk. +0.5 to +1 on Tech and UX.
2. **Real phones, real people, every attempt logged.**
   - iPhone and Android recordings on the deployed URL.
   - 3 touch vs 3 KIBO runs including a person over 65 and a low-vision user.
   - Report voice as "N attempted / M passed".
   - Effect: +1 on Impact, more credibility on Tech.
3. **Show KIBO Learn generalising safely.**
   - Scope ambiguous `+` / `수량 더하기` clicks to the open sheet or the target line, and refuse before clicking when ambiguous.
   - Publish the four-kiosk baseline vs final table with unsafe = 0.
   - Explain how the bridge is deployed on a vendor's kiosk.
   - Stop calling Doughhouse "third-party".
   - Effect: +1 on Innovation.
4. **Cut perceived latency.**
   - Measure production p50/p90.
   - Stream the reply text, or skip the second model round when every tool succeeded.
   - Show the kiosk change as soon as the command is applied (26–36 ms on the server).
   - Use a faster Vertex endpoint for the fallback.
   - Effect: about 7 s toward 2–3 s perceived. +0.5 on UX and Tech.
5. **One source of truth for numbers, and a complete submission.**
   - Generate README, landing and deck numbers from the evidence files.
   - Add `kibo-voice` to the architecture diagram.
   - Fix the stale "not built yet" line.
   - Publish the repo, the ≤ 2:50 video and the deck. Show the 409 "Please confirm on the card" refusal in the video.
   - Effect: removes the "numbers drift" doubt across every criterion.

Files are in `/private/tmp/claude-501/-Users-sungmincho-mac-Desktop-sm-apps-kibo/5e4077f3-a03e-418a-bb20-c3c1f77daf49/scratchpad/judges/tech/`:
- `probe.mjs`
- `probe2.mjs`
- `chatapi.mjs`
- `chatB.json`
- `chatC.json`
- `health.json`
- `tour.json`
- `shots/`