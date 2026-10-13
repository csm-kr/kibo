# Step 8: voice-relay

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. ADR-003 (ephemeral Live tokens), ARCHITECTURE "Voice" and "Limits and cost", SECURITY (voice budget, token rules), RULE (all).
- Code: `src/lib/agent/live.ts` (+ test: `liveConfig`, `liveConnectConfig`, `issueLiveToken`, budgets), `src/app/api/live-token/route.ts`, `src/hooks/useLiveVoice.ts`, `src/lib/voice/*`, `src/lib/limits/*`, `src/lib/store/*`, `Dockerfile`, `scripts/deploy.sh`, `next.config.ts`; issues I-104, I-148.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
Voice runs only on the Gemini API key, which is paid from AI Studio **prepaid** credits; they ran out twice on 10-13 (I-104) and the live site lost voice each time. The user does not want the product to depend on prepaid credits during judging (10-19 to 11-06; the URL must keep working). The orchestrator verified on 10-13 that **Vertex AI serves `gemini-3.8-live` in `us-central1`** (not in `global`, `asia-northeast1/3` or `europe-west4`): connect 2.2 s, first audio 3.3 s for a one-line text turn, billed to the project's post-paid Cloud billing. Vertex has no ephemeral tokens for browsers, so the browser needs a server relay. Everything stays on Google (CLAUDE.md: Gemini only; no other cloud).

## Task
Build a WebSocket relay **as a second, small Cloud Run service** (`kibo-voice`) from this repo, so the Next.js service and its standalone server stay untouched (Next.js route handlers cannot accept WebSocket upgrades, and a custom server does not work with `output: "standalone"`).
1. `voice-relay/` (TypeScript, bundled with `esbuild` from `npm` devDependencies into one file; reuses `src/lib/agent/live.ts` config builders and `src/lib/store` so the instructions, tools and limits are the **same code** as the token path): an HTTP server with `GET /healthz` and a WebSocket endpoint `/ws`.
2. **Auth and limits, same as the token route:** the client's first message is `{ sessionId, deviceToken, locale }`; the relay runs the same checks and budget accounting as `issueLiveToken` (claimed session, device token, demo limits, per-session and daily voice budgets, I-148), builds the pinned config server-side (`liveConfig` with the current cart), and opens Vertex Live (`@google/genai` with `vertexai: true`, project from env, location `us-central1`, ADC from the runtime service account). The browser never sends or sees the instructions or tools; any `setup` message from the client is dropped.
3. **Pipe:** after setup completes, forward client → Vertex (`realtimeInput` audio, `clientContent`, `toolResponse`) and Vertex → client (server content, tool calls, transcriptions, `goAway`, usage), unchanged in shape so the existing client handler can read them. Enforce the same max session length as the token path, close both sides together, never log audio or transcripts.
4. `Dockerfile.voice` and `scripts/deploy-voice.sh` (`gcloud run deploy kibo-voice --region asia-northeast3`, same runtime service account, `--timeout 900`, `--min-instances 0`, `--max-instances 2`, session affinity on, last line `DEPLOYED <rev>` / `DEPLOY FAILED` like `scripts/deploy.sh`); do **not** run it (the orchestrator deploys).
5. Tests first: unit tests for auth failures (no session, wrong token, budget exhausted → a close code and a plain reason), dropped client setup, the pinned config, and closing on either side, with a fake Vertex session. Then one real local check: run the relay locally with ADC and drive one short text turn through it with a small `node` script (`npm run voice:relay-check`), record the timing in the summary (cost: one turn).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run voice:relay-check
```

## Verify
1. Run the AC commands.
2. Check: no API key or instructions reach the browser; no new non-Google service; the Next.js service, `Dockerfile` and `scripts/deploy.sh` are unchanged.
3. Update this step in `phases/12-phone-app/index.json` (completed + summary / error / blocked).

## Do not
- Do not use any non-Google AI or cloud (the hackathon rules and CLAUDE.md).
- Do not deploy, and do not change IAM.
- Break existing tests.
