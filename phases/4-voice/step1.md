# Step 1: live-client

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: ARCHITECTURE "Voice" (half-duplex, reconnect, iOS, fallback), "Commands and actors" (`utteranceSeq`, `commandId` for voice = `<liveSessionId>:<functionCallId>`), "Sequence diagrams" 1; SECURITY "Reliability" (one tab holds Live via `navigator.locks`; [Try again] and `paid` close it); UX "Accessibility" (voice replies, half-duplex, aria-live suppressed while the AI speaks).
- Code: `src/app/api/live-token/route.ts`, `src/lib/agent/{mapping,live}.ts`, `src/lib/client/api.ts`, `src/hooks/useSessionStream.ts`, `src/hooks/usePhoneSession.ts`, `src/components/assistant/AssistantPanel.tsx` (the marked mic slot).
- SDK browser build: `node_modules/@google/genai` (`live.connect`, callbacks, `sendRealtimeInput({ audio: { data, mimeType } })`, `sendToolResponse({ functionResponses })`, `sendClientContent`, server message fields `serverContent.modelTurn`, `inputTranscription`, `outputTranscription`, `interrupted`, `turnComplete`, `toolCall`, `goAway`). Input audio is 16 kHz mono 16-bit PCM (`audio/pcm;rate=16000`); output audio is 24 kHz mono 16-bit PCM.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
The browser side of Gemini Live: microphone capture, playback, tool execution against `/api/command`, turn counting, reconnect and fallback. Pure parts get **tests first**.

### Pure modules (tests first): `src/lib/voice/`
- `pcm.ts`: `downsampleTo16k(input: Float32Array, inputRate: number): Int16Array`, `int16ToBase64(Int16Array): string`, `base64ToFloat32(b64): Float32Array` (24 kHz output). Test with synthetic sine waves (length and range).
- `turns.ts`: a reducer that counts **finished user turns** (`utteranceSeq`): user speech is marked when an `inputTranscription` arrives; the counter increases once when the first model output or tool call of the following response arrives (so every tool call in that response carries the new seq). Test: requestCheckout and confirmCheckout in one response share a seq; a new spoken "yes" increases it.
- `toolRunner.ts`: `runToolCalls(calls, ctx) → functionResponses` where `ctx` has `send(cmd)` (POSTs `/api/command` with `source: "voice"`, `commandId = ${liveSessionId}:${call.id}`, the current `utteranceSeq`, and for `confirmCheckout` the `cartVersion` currently shown on the phone), `kiosk`, `locale`. Results come from `toolResult()`. Test with a fake `send`: ids, seq, cartVersion, errors as results.

### Audio: `public/audio/pcm-recorder-worklet.js`
An `AudioWorkletProcessor` that posts Float32 frames (about 20–40 ms) to the main thread. The main thread downsamples to 16 kHz and sends base64 chunks. Playback uses one `AudioContext` at 24 kHz (or resamples), schedules `AudioBufferSourceNode`s back to back, and can stop all on `interrupted` or when the user taps stop.

### Hook: `src/hooks/useLiveVoice.ts`
```ts
export function useLiveVoice(opts: { sessionId; deviceToken; kiosk; locale; getCartVersion: () => number; onUserText(t: string): void; onAiText(t: string): void; onFallback(reason: string): void; voiceOutput: boolean }): {
  state: "off" | "connecting" | "listening" | "thinking" | "speaking" | "reconnecting" | "error";
  start(): Promise<void>;   // must be called from a tap (iOS needs a user gesture to start audio)
  stop(): void;
  secondsLeft: number | null;
}
```
- `start()`: create/resume the `AudioContext` inside the tap; `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })`; POST `/api/live-token`; connect with `new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } }).live.connect({ model, callbacks })`; new `liveSessionId = crypto.randomUUID()` per connection.
- **Half-duplex:** do not send microphone audio while AI audio is playing and for 300 ms after it ends (the AI must not hear itself). Show `speaking` then `listening`.
- `voiceOutput: false` (the user turned the AI voice off): do not play audio; show the output transcription only.
- Transcripts: `inputTranscription` → `onUserText` (what it heard, UX A5), `outputTranscription` → `onAiText`.
- Tool calls → `runToolCalls` → `sendToolResponse`. The session stream updates the UI; nothing else is needed.
- **Reconnect:** on an unexpected close or `goAway`, fetch a new token (its instructions include the current cart, marked already applied) and reconnect, state `reconnecting`. After **two** failed attempts, or on `RATE_LIMITED`/`UPSTREAM` from the token route, or when the microphone is denied or missing: stop and call `onFallback(plainReason)` (the UI switches to text).
- Voice time limit: `secondsLeft` counts down from the token's `voiceSeconds`; at 0 stop and fall back to text with "Voice time for this order is up. Please type."
- One tab only: hold a `navigator.locks` lock named `kibo-live-<sessionId>` while connected; a second tab gets `onFallback("Voice is open in another tab.")`.
- `stop()` closes the session, releases the mic and lock, stops playback. Also stop when the session reaches `paid` or `expired`.
- Never log audio, transcripts or tokens.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. Run the AC commands.
2. Check: `commandId` format `<liveSessionId>:<functionCallId>`; `utteranceSeq` from finished user turns; `confirmCheckout` sends the displayed `cartVersion`; half-duplex mute; reconnect then fallback after two failures.
3. Update this step in `phases/4-voice/index.json` (completed + summary / error / blocked).

## Do not
- Do not route audio through our server (ADR-003).
- Do not auto-confirm or chain tools on the client; the client only executes the calls the model makes, through `/api/command`, which enforces every rule.
- Do not build the mic button UI here; the next step does.
- Break existing tests.
