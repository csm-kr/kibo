# Step 0: text-fallback

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: ADR-011; ARCHITECTURE "Environment variables", "Limits and cost"; ISSUE I-104 (Gemini API prepaid credits ran out on 10-13), I-105 (Vertex latency); `docs/plan/OPERATIONS.md` (deploy, quotas).
- Code: `src/lib/agent/model.ts` (+ tests; `GEMINI_TEXT_BACKEND`, `textClientOptions`, `textGenAI`), `src/lib/agent/chat.ts`, `src/lib/health.ts`, `scripts/eval-agent.ts`, `scripts/deploy.sh`, the latest `evals/results/*.md`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why (orchestrating session, 10-13)
The user topped up the AI Studio credits on 10-13 around 05:15 KST, so the Gemini API key works again (checked: `generateContent` 200; production `/api/health?deep=1` all ok; a Live token connected and called `addToCart` in 2.6 s). Measured text-agent latency so far: Gemini API with thinking `low` median 6.0 s / p90 9.9 s per request (`evals/results/2026-10-13T01-45.md`); Vertex AI median 8.2 s / p90 23.0 s with `RATE_LIMITED` and `UPSTREAM` errors during the eval (`evals/results/2026-10-13T05-51.md`). So the fast path is the API key, and Vertex is the safety net for billing or quota failures.

## Task (tests first; no network in unit tests)
1. `GEMINI_TEXT_BACKEND` accepts `api`, `vertex` and **`auto` (new default)**. `auto` calls the API-key client first and, **only** when that call fails with a billing error (402), a quota error (429) or a 5xx/network error **before any function call result was used**, retries the same request once on Vertex. A request never mixes backends within one chat round trip after a tool ran: the fallback happens per `generateContent` call, and the history passed is the same, so tool results stay consistent. Log `gemini text fallback api->vertex (<status>)` without bodies.
2. Keep a small in-memory circuit: after 3 API failures with 402 within 5 minutes, use Vertex directly for the next 10 minutes (so a credit outage does not add a failed call to every request).
3. `scripts/deploy.sh` sets `GEMINI_TEXT_BACKEND=auto`; ARCHITECTURE, ADR-011 and OPERATIONS say which backend serves what and why (R-002). Deep health keeps `textGenerate` (through the configured backend) and `keyGenerate`.
4. Run `npm run eval:agent` with the default (`auto`, which uses the API key now) and report the pass rate and latency; compare with the 05-51 Vertex run in the summary. Mark I-104 fixed (credits topped up; fallback in place) and update I-105 with the numbers.

### Part B: voice recognition settings from the 10-13 comparison
`spikes/voice-compare/RESULTS.md` (offline comparison on 180 synthetic Korean/English kiosk clips; read it) found:
- Without `inputAudioTranscription.languageCodes`, `gemini-3.8-live` missed 5 of 6 short "네" answers and misheard some menu names in noise; **with `languageCodes` set to the session language, those errors disappeared at the same latency and no cost** (Korean key-term recall 96.6 → 97.1% clean, 93.7 → 95.4% noisy). `customVocabulary` and menu names in the system instruction did not change transcripts.
- Short answers like "네" sometimes took 3.5–8.9 s until Live decided the user stopped speaking.
Do, test-first where it is code:
1. `liveConfig` / the pinned Live config sets `inputAudioTranscription: { languageCodes: [<BCP-47 of the phone locale: "ko-KR" or "en-US">] }` (check the installed SDK's field name and shape). The locale already comes with the token request.
2. Check whether the installed SDK exposes `realtimeInputConfig.automaticActivityDetection` (e.g. `silenceDurationMs`, `endOfSpeechSensitivity`) for `gemini-3.8-live`; if so, set a shorter end-of-speech silence (for example 500–700 ms, high end-of-speech sensitivity) so short answers finish faster, and keep it in the pinned constraints. If the field is not supported by the model, record that and change nothing.
3. Run `npm run test:e2e:live` (voice fixtures) once; the hero voice runs must still pass. Add a short Korean "네" fixture via `npm run fixtures:voice` only if cheap.
4. The comparison found `scripts/make-voice-fixtures.ts` assumes headerless PCM, but `gemini-3.8-flash-tts` now returns audio with a WAV header, so 44 bytes become a click at the start: detect a `RIFF` header and strip it. Log it in `docs/ISSUE.md`.
5. Add one row to the `docs/TESTING.md` ledger for the comparison (Korean key-term recall clean/noisy for Gemini Live with and without `languageCodes`, file `spikes/voice-compare/RESULTS.md`, "synthetic TTS voices, offline comparison; non-Google systems were measured for reference only and are not used in the product").

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run eval:agent
npm run test:e2e
npm run test:e2e:live
```

## Verify
1. Run the AC commands.
2. Unit tests cover: API ok → no Vertex call; API 402 → Vertex once; API 400 (bad request) → no fallback, error surfaces; circuit opens after 3 × 402 and closes after 10 minutes (fake clock).
3. Update this step in `phases/8-scenarios/index.json` (completed + summary / error / blocked).

## Do not
- Do not retry more than once per call, and never retry after a tool call's command was applied (no double orders).
- Do not use non-Gemini models.
- Break existing tests.
