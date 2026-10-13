# Step 9: voice-fallback

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. ADR (all), ARCHITECTURE "Voice", SECURITY, UX C3 (voice fallback), RULE R-001, R-002.
- Step 8's summary and `voice-relay/`; `src/app/api/live-token/route.ts`, `src/lib/agent/live.ts`, `src/hooks/useLiveVoice.ts`, `src/lib/health.ts`, `src/lib/agent/model.ts` (the text backend's `auto` circuit, for the pattern), `e2e/voice.live.spec.ts`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
Step 8 built a Vertex Live relay paid from post-paid Cloud billing. The phone must use it automatically when the Gemini API key cannot serve voice (HTTP 402 prepaid credits depleted, or the key missing), so voice keeps working through judging without anyone topping up credits. The direct key path stays first while it works, because it is measured (first audio median 2.07 s, `evidence/voice-e2e.json`) and has one hop less.

## Task
1. New env `GEMINI_LIVE_BACKEND` = `auto` (default) | `api` | `vertex`, and `VOICE_RELAY_URL` (the `wss://` URL of `kibo-voice`, set by the orchestrator at deploy). `POST /api/live-token` returns `{ mode: "direct", token, ... }` as today, or `{ mode: "relay", url }` when the backend is `vertex`, or when `auto` and the key cannot generate (a 402 or missing key seen by the token issuer or a cached key probe like the deep health's `keyGenerate`, with a short circuit like the text backend's so it does not probe on every request). The relay mode does not take the budget twice (the relay accounts it, step 8). Tests first.
2. `useLiveVoice`: in relay mode, connect to the relay with a browser `WebSocket`, send `{ sessionId, deviceToken, locale }`, then reuse the same message handling, audio send and tool runner as the direct path (no second copy of the voice logic). Reconnects ask `/api/live-token` again, so a recovered key goes back to direct.
3. `/api/health?deep=1` adds `liveRelay` (relay `/healthz` reachable when `VOICE_RELAY_URL` is set) and treats `keyGenerate: fail` as ok when the relay is healthy (voice still works); keep the key status visible in the body.
4. `e2e/voice.live.spec.ts`: a relay variant (`GEMINI_LIVE_BACKEND=vertex`, relay started locally by the test setup) that runs `hero-ko` with the fake microphone and checks the kiosk fills; run `npm run test:e2e:live` once and record per-mode results. Record first-audio and kiosk-highlight latency for the relay mode in `evidence/voice-e2e-relay.json` (one run of each fixture, R-001).
5. Docs: ADR-012 "Voice fallback through a Vertex Live relay" (why, alternatives: top up only, always relay, another vendor rejected by the rules), ARCHITECTURE "Voice", SECURITY (relay auth, no instructions in the browser), OPERATIONS (deploy order: `deploy-voice.sh` first, then `deploy.sh` with `VOICE_RELAY_URL`), TESTING ledger row; close or update I-104.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run test:e2e:live
```

## Verify
1. Run the AC commands (report the live results honestly; the direct mode may still fail with HTTP 402: that is expected and is the reason for this step).
2. Check: the payment rule and the confirm card behave the same in both modes; the browser never receives instructions, tools or keys in relay mode.
3. Update this step in `phases/12-phone-app/index.json` (completed + summary / error / blocked).

## Do not
- Do not remove the direct path.
- Do not use any non-Google AI or cloud.
- Break existing tests.
