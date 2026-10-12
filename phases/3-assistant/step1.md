# Step 1: chat-api

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: ARCHITECTURE "Endpoints" (`/api/chat`), "Limits and cost", "`usage/{yyyy-mm-dd}`", "`sessionSecrets`", "Environment variables"; ADR-003, ADR-011; SECURITY "Command handling", "Abuse and cost", "Secrets and repo hygiene" (no utterances in logs).
- `src/lib/agent/*` (step 0), `src/lib/session/service.ts`, `src/lib/store/*`, `src/lib/http.ts`, `src/lib/limits/ip.ts`, `src/app/api/command/route.ts`.
- The installed SDK: `node_modules/@google/genai` (README and types for `models.generateContent`, function calling, `FunctionCallingConfigMode`). Gemini 3 models return thought signatures with function calls: append the model's returned `content` to the history **unchanged** before sending function responses, or the next call fails.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
`POST /api/chat`: the Gemini Flash function-calling loop over the same commands the phone sends. **Tests first** with a fake model client; no network in tests.

### Model client: `src/lib/agent/model.ts`
```ts
export interface ModelTurn { role: "user" | "model"; parts: unknown[] }   // SDK Content
export interface ModelClient { generate(req: { system: string; contents: ModelTurn[]; tools: object[] }): Promise<{ content: ModelTurn; functionCalls: { id?: string; name: string; args: unknown }[]; text: string }> }
export function geminiClient(): ModelClient   // GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }), model process.env.GEMINI_TEXT_MODEL ?? "gemini-3.8-flash", maxOutputTokens capped (e.g. 1024), low temperature
```
Errors: HTTP 429 from Gemini → `CommandError("RATE_LIMITED", "Please try again in a moment.")`; any other failure → `CommandError("UPSTREAM", "The assistant is not available right now. Please use the buttons or try again.")`. Never include model output or the API key in errors or logs.

### Usage limits: `src/lib/limits/usage.ts`
```ts
export interface UsageStore { bump(key: string, field: string, limit: number): Promise<boolean> }   // atomically +1 unless at limit; false when over
```
Memory and Firestore implementations chosen like `getStore()` (Firestore: `usage/{yyyy-mm-dd KST}` with `FieldValue.increment` inside a transaction). Per-session counts (`chatCount`, later `liveTokenCount`) live in `sessionSecrets` and are bumped inside the session transaction: add a small service function `bumpSessionCounter(store, sessionId, field, limit)`.
Limits: `/api/chat` 60 messages per session (30 for `demo` sessions), 3,000 per day; over → `RATE_LIMITED` with a plain message ("You've reached the message limit for this order. Please use the buttons.").

### Route: `src/app/api/chat/route.ts` and `src/lib/agent/chat.ts`
Body (zod, strict): `{ sessionId, chatRequestId: uuid, message: string 1–500, history: ≤ 10 × { role: "user" | "model", text: string ≤ 1000 }, utteranceSeq: int ≥ 0, cartVersion?: int, locale: "ko" | "en" }` + `Authorization: Bearer <deviceToken>`. Any other role or extra field (for example tool turns) → `BAD_REQUEST`.
`runChat(deps: { store, model, now, usage }, input) → { reply, status, cart, total, cartVersion }`:
1. Load the session; the bearer must be the **device** token (the kiosk token → `FORBIDDEN`); bump the limits.
2. System instruction = `buildInstructions(kiosk, { cart, status, dineOption, locale })`; tools = `toolDeclarations(kiosk)`; contents = history as text turns + the new message.
3. Loop at most **5 rounds**: for each function call, `toolCallToCommand`, then `runCommand` through the session service with `commandId = \`${chatRequestId}:${n}\``, `source: "text"`, `utteranceSeq` from the body, and for `confirmCheckout` the body's `cartVersion` (absent → the call fails with `CONFLICT`, and the model is told to ask the user to confirm on the card). Turn each outcome into `toolResult(...)` and send all function responses back in one user turn (keep call ids). Errors from commands are results for the model, not HTTP errors.
4. Stop when the model answers with text and no calls; after 5 rounds return the last text or a fixed fallback ("Sorry, could you say that again?").
5. Return the reply plus the current session state from the store.
Never log `message`, `history` or the reply (SECURITY: utterances may contain health information); log only tool names and result codes.

### Tests (fake `ModelClient` scripted per test)
- hero: the fake returns two `addToCart` calls, then text → cart has 2 lines, reply returned, commandIds `<chatRequestId>:0` and `:1`;
- `NEEDS_CHOICE` comes back to the model as a result with drink choices, and an `offerChoices` call then sets `pendingChoice`;
- `requestCheckout` and `confirmCheckout` in one request → the confirm result is `CONFLICT` and the status stays `confirming`; the next request with a higher `utteranceSeq`, the right `cartVersion` and 1.6 s later → `paying`;
- the 6th round is never executed; history with a tool turn → 400; message of 501 chars → 400; kiosk token → 403; 61st message → 429; a model 429 → 429 with the plain message;
- retrying the same `chatRequestId` does not double-add (idempotent command ids).

### Manual check (real Gemini, once)
With `.env` loaded by `next dev` (memory store), run a short `node` script against `http://localhost:<port>`: create a demo session, send "Two cheeseburger sets. One without pickles; drinks zero cola and cider." and print only the resulting cart item ids, total and status (not the reply text, not the key). Note the outcome in the summary.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. Run the AC commands and the manual check.
2. Check: the API key never reaches the browser or logs; `confirmCheckout` cannot pass in the same request as `requestCheckout`; ≤ 5 rounds; ≤ 500 chars.
3. Update this step in `phases/3-assistant/index.json` (completed + summary / error / blocked; if the Gemini key is missing or rejected, set blocked with the reason).

## Do not
- Do not use any model other than Gemini (CLAUDE.md).
- Do not trust the model: every call goes through `runCommand` and its validation.
- Do not store the conversation on the server (phone memory only, ARCHITECTURE "State management").
- Break existing tests.
