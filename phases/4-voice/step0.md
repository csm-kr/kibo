# Step 0: live-token

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: ADR-003, ADR-011; ARCHITECTURE "Voice", "Limits and cost", "`sessionSecrets`" (`liveTokenCount`), "Endpoints" (`/api/live-token`); SECURITY "Gemini Live tokens", "Abuse and cost".
- Code: `src/lib/agent/{instructions,tools,model}.ts`, `src/lib/limits/{ip,usage}.ts`, `src/lib/session/service.ts` (`bumpSessionCounter`), `src/app/api/chat/route.ts` (pattern for auth, limits, errors), `src/lib/http.ts`.
- SDK: `node_modules/@google/genai` types for `authTokens.create`, `LiveConnectConstraints`, `Modality`, and the ephemeral-token docs in the package README. A manual check on 10-12 showed this works with `gemini-3.8-live`: `new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1alpha" } }).authTokens.create({ config: { uses: 1, expireTime, newSessionExpireTime, liveConnectConstraints: { model, config: { responseModalities: [Modality.AUDIO], systemInstruction, tools: [{ functionDeclarations }] } }, httpOptions: { apiVersion: "v1alpha" } } })` returns `{ name: "auth_tokens/…" }`, and the browser connects with that `name` as its API key.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
`POST /api/live-token`: a one-use ephemeral Gemini Live token with the model, instructions and tools pinned. **Tests first** with a fake token issuer; no network in tests.

### `src/lib/agent/live.ts`
```ts
export interface LiveTokenIssuer { create(input: { model: string; system: string; tools: object[]; expireTime: string; newSessionExpireTime: string }): Promise<{ name: string }> }
export function geminiTokenIssuer(): LiveTokenIssuer          // uses process.env.GEMINI_API_KEY
export function liveConfig(kiosk: KioskData, opts: { cart; status; dineOption; locale }): { model: string; system: string; tools: object[] }
export async function issueLiveToken(deps: { store; usage; issuer; now }, input: { sessionId: string; bearer: string | null; locale: Locale }): Promise<{ token: string; model: string; expiresAt: number; voiceSeconds: number }>
```
- Device token only (kiosk token → `FORBIDDEN`); session must be before `paying` (→ `CONFLICT`) and not expired (→ `GONE`).
- Limits: per session `liveTokenCount` ≤ 2 for `demo` sessions and ≤ 6 otherwise (reconnects need new tokens); per day 200 voice sessions (`usage` `voiceSessions`). Over → `RATE_LIMITED` with "Voice is busy right now. Please type instead."
- Pinned config (`liveConnectConstraints.config`): `responseModalities: [AUDIO]`, `systemInstruction` = `buildInstructions(kiosk, { cart, status, dineOption, locale })` (the current cart is in it, marked already applied), `tools: [{ functionDeclarations: toolDeclarations(kiosk) }]`, `inputAudioTranscription: {}` and `outputAudioTranscription: {}` (the phone shows what it heard and what the AI said), and a speech config only if the SDK documents one for this model (leave the default voice otherwise).
- Times: `newSessionExpireTime` = now + 60 s (the phone connects right away); `expireTime` = now + 3 min for `demo` sessions (the `/demo` voice limit) and now + 10 min otherwise. Return `voiceSeconds` (180 or 600) so the phone can show and enforce the limit; whether `expireTime` closes an already open connection is unverified (SECURITY), so the phone also stops on its own timer.
- Model id from `GEMINI_LIVE_MODEL` (default `gemini-3.8-live`, ADR-011).
- Errors from Gemini: 429 → `RATE_LIMITED` ("Voice is busy right now. Please type instead."), others → `UPSTREAM`. Never log the token or the key.

### Route: `src/app/api/live-token/route.ts`
Body `{ sessionId, locale }` + bearer → `{ token, model, expiresAt, voiceSeconds }`, `Cache-Control: no-store`, per-IP limit as for the other routes.

### Tests
- device token gets a token; kiosk token 403; no token 401; `paying` 409; expired 410;
- the issuer receives the pinned model, instructions containing the menu block and the current cart, and the 9 tools; transcription is on;
- the 3rd token for a demo session and the 7th for a normal session → 429; daily limit → 429;
- an issuer 429 → 429 with the plain message; the response never contains the API key.

### Manual check (real Gemini, once)
With `next dev` and `.env` loaded, a `node` script creates a demo session, gets a token, connects with `@google/genai` `live.connect` using the token, sends the text turn "One cheeseburger set with zero cola, please." with `sendClientContent`, and waits for a `toolCall`; print only the function names and argument item ids, then close. Report it in the summary.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. Run the AC commands and the manual check.
2. Check: the API key never leaves the server; the token is one-use and short-lived; model, instructions and tools are pinned server-side.
3. Update this step in `phases/4-voice/index.json` (completed + summary / error / blocked).

## Do not
- Do not send the Gemini API key or the full instructions to the browser; the token carries them.
- Do not relay audio through our server (ADR-003).
- Break existing tests.
