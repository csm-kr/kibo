# Phase 4-voice QA report (10-13, step 4)

Scope: P1 (mic hint, in-app browser), P3 mic states (connecting, listening, noise hint, reconnecting, failed, fallback), PX (stream "Reconnecting…", voice fallback), D2 (voice fallback). Screenshots and `ui-qa.jsonl` in this folder (`npm run qa:ui`). No H failure on a scoped screen; nothing fixed in product code.

| Angle | Result | Notes |
|---|---|---|
| A Numbers | pass | `qa:ui` 0 H, 0 T on every scoped state at 390×844, 360×800, 430×932, 320×700 and the three `/demo` sizes; mic ≥ 88px with a ≥ 2px focus ring asserted in every mic state. The only T miss is the old K6 − / + contrast "human review" inside D2-confirm (I-043) |
| B Visual heuristics | pass (P2) | One focal point per state; the state is in the mic label, not only color. At 320×700 the voice footer takes about half the screen (I-084) |
| C Flows | pass | Flow A by voice: hero sentence 6/6 on `/demo` with `gemini-3.8-live` (`evidence/voice-e2e.json`, no `src/` change since). Fries, "I'll pay" and a spoken "yes" not run by voice (I-085). Flow C3: token 429 → plain reason, text input focused (P3-voice-fallback, D2-voice-fallback). "Noise": hint after two heard turns with no tool (P3-voice-noise). "Phone screen off / disconnected": reload keeps token, screen and cart; "Reconnecting…" shows while the stream is down (PX-reconnecting); Live drop → "Reconnecting…" → after 2 failed retries text takes over (P3-voice-reconnecting, P3-voice-failed). Screen lock on a real phone unchecked (I-085) |
| D Journeys | pass, real phone pending | J1 Connect/Order: picture hint before the browser prompt, deny → text, transcript in the chat. J3: no mic or Live down → text comes forward with the input focused. Real-phone walk planned 10/14–16 (I-085); reply latency (a) median 2,070 ms over target (I-082) |
| E Nielsen 10 | pass | 1: mic label names each state, "Reconnecting…" banner; 3: tap to stop; 9: plain reasons with the next step ("Please type instead."); 10: mic hint and noise hint |
| F Accessibility | pass | axe 0 violations; mic is a real button with its state in the accessible name; AI voice is `role=switch`; cart `aria-live` is off while the AI speaks; pulse static under reduced motion (asserted) |
| G Content | pass | Phone copy plain English, no technical terms; voice replies grounded in menu data (I-072 fixed, eval 32/32 `evals/results/2026-10-13T02-54.md`) |
| H First 20 seconds | pass | D1 → D2 unchanged; with no mic the judge lands in a focused text input with the reason shown. "Talk" promise on D1 now backed by voice (I-077 kept open until the real-phone check) |
| I Rules | pass | R-001: numbers above cite their files. R-002: UI_QA coverage line updated. R-003: voice states missing from the spec added in this step (I-083); Korean pass still open (I-065) |

Security spot checks (dev server, memory store, `/tmp` script printing only statuses and booleans):
- `/api/live-token` with the kiosk token → 403 FORBIDDEN; no token → 401 UNAUTHORIZED.
- Demo session: tokens 1 and 2 → 200 with keys `ok, token, model, expiresAt, voiceSeconds`; token 3 → 429 RATE_LIMITED.
- After `confirmCheckout` (status `paying`) → 409 CONFLICT.
- API key prefix in any token response: false. In `.next/static` (307 files after `npm run build`): false.
- The 6-token phone limit and daily limit are covered by `src/lib/agent/live.test.ts`, not re-run live.

Acceptance: `npm run lint`, `npm run build`, `npm run test`, `npm run test:e2e`, `python3 design/prototype/e2e_check.py` (42 pass), `npm run qa:ui`.
