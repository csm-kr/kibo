# Architecture Decision Records

## Philosophy
Ship one vertical demo that works end to end and survives three weeks of judging. Prefer the simplest design that keeps the voice-to-kiosk loop under ~3 s and the payment step safe. Every number we show must come from a saved measurement.

---

### ADR-001: One Next.js app on Cloud Run
**Decision**: A single Next.js (App Router, TypeScript, Tailwind) app serves `/kiosk`, `/assistant`, `/demo` and `/api/*`, deployed to Cloud Run in `asia-northeast3`, `min-instances=1`, `max-instances=3`.
**Why**: Screens share components, one deploy, HTTPS by default (needed for the mic). Hackathon rules require Cloud Run or Firebase.
**Trade-off**: No separate realtime server; we rely on Firestore for sync.

### ADR-002: Firestore session document is the single source of truth
**Decision**: `sessions/{id}` holds cart, status, highlight info. Clients only read it, through the server's event stream (ADR-010); all writes go through `POST /api/command` in a transaction.
**Why**: Two screens stay in sync without WebSockets; validation, idempotency and state transitions live in one place.
**Trade-off**: Each change costs one server round trip. Browsing therefore stays local on the kiosk; only taps that change the session (start, dine option, cart, checkout) go to the server, with optimistic UI for cart changes.

### ADR-003: Phone talks to Gemini Live directly
**Decision**: The phone opens a Gemini Live session with a server-issued ephemeral token (`uses: 1`, model, instructions and tools pinned by `liveConnectConstraints`). Function calls are forwarded to `/api/command`. A text agent at `/api/chat` uses the same `lib/agent` definitions.
**Why**: No audio relay through our server, lower latency and cost. The text path is the fallback if Live is unstable.
**Trade-off**: Tool arguments arrive from the browser and must be fully validated server-side (zod, catalog membership, ranges). When the key cannot pay, voice goes through a relay after all (ADR-012).

### ADR-004: Whole menu in the instructions, 9 tools
**Decision**: The catalog (~35 items with option groups) goes into the agent instructions. Tools: `setDineOption`, `addToCart`, `updateCart`, `removeFromCart`, `undoLastChange`, `offerChoices`, `callStaff`, `requestCheckout`, `confirmCheckout`. Mutating tools return the updated cart.
**Why**: One tool call per sentence instead of search-then-add; meets the latency target.
**Trade-off**: Very large menus need a `searchMenu` tool; the adapter decides.

### ADR-005: Server-enforced session state machine
**Decision**: `idle → (connected →) ordering ⇄ confirming → paying → paid`, plus `paying → confirming` (edit) and `expired`. `confirmCheckout` is accepted only in `confirming` with a matching `cartVersion`, and either a tap on the confirm card or, from the AI, a new user utterance at least 1.5 s after the card appeared. An AI confirm needs a review the phone's AI opened; after a kiosk-opened review or `editOrder` only a tap confirms (10-12, I-029). `paid` comes only from the kiosk card action with a `kioskToken`.
**Why**: The AI can never skip the confirm card or complete a payment.
**Trade-off**: More server logic and tests.

### ADR-006: Actor tokens
**Decision**: QR claim token (one use) → `deviceToken` for the phone; `kioskToken` for the kiosk/bridge. Secrets live in `sessionSecrets/{id}` (server only). Allowed commands are a per-actor table.
**Why**: The session id is public in the QR; without actor tokens anyone could change the cart or mark it paid.
**Trade-off**: Token handling on reconnect (stored in localStorage per kiosk/phone).

### ADR-007: KIBO Learn, learn once and replay without AI
**Decision**: For kiosks without integration, an offline learner drives the kiosk UI (Playwright, accessibility tree + "tappable labels" from clickable elements), records findings, writes a skill (catalog + click recipes), and may only finish after the skill passes ≥ 3 different self-test orders. At runtime an in-page bridge script replays recipes and verifies the kiosk's own total and cart lines. No runtime self-healing; on failure, stop and hand over to staff or touch.
**Why**: Per-order vision control is slow, costly and non-deterministic. In the app the bridge replayed each command in 73–645 ms (4 commands, one automated run, `evidence/bridge-replay.json`, the 350 ms pause per tap for people not included; first measured 0.7–5.2 s per order in the 10-12 spike, `spikes/kibo-learn/results/holdout.run2.log`), and replay is auditable.
**Trade-off**: Web/webview kiosks only; quantity and conditional options are still weak; skills must be re-learned when the kiosk UI changes.

### ADR-008: Model and vendor use
**Decision**: The product uses Gemini only (Live, Flash, Vertex for learning). OpenAI (`gpt-6.1-sol`) is used only during development to iterate on the learner; numbers shown in the deck and video are re-measured with Gemini. Menu and promo images are generated offline (Codex image generation; earlier ones with Gemini image generation).
**Why**: Hackathon rules require Gemini/Google AI; development credits are cheaper on OpenAI.
**Trade-off**: Two learner backends to keep in sync (`PROVIDER=gemini|openai`).

### ADR-009: Menu data in the repo, not Firestore
**Decision**: Direct-adapter menus live in `data/kiosks/*.json`; learned kiosks in `skills/*.json`. Firestore stores sessions only.
**Why**: No seed scripts, no read latency, the menu never changes during the demo.
**Trade-off**: Menu edits need a deploy.

### ADR-010: Clients read the session through a server event stream (SSE), not the Firebase client SDK
**Decision** (10-12, replaces "clients `get` and `onSnapshot`" in ADR-002): `GET /api/session/{id}/events` is a Server-Sent Events stream. The route subscribes to `sessions/{id}` with the Admin SDK `onSnapshot` and forwards each snapshot as one `data:` line of the public session JSON. Browsers use `EventSource` and never load the Firebase client SDK. Firestore rules deny every client read and write. The store sits behind a `SessionStore` interface with two implementations: Firestore (production, `STORE=firestore`) and in-memory (`STORE=memory`, tests and local E2E).
**Why**: No Firebase web app, public web config or rules deployment to maintain; one place controls what clients can see; unit and E2E tests run without network or credentials; the session id alone no longer opens a direct database read.
**Trade-off**: Each open screen holds one Cloud Run request (concurrency 80 per instance, `max-instances=3`), streams end after 15 min (server cap, below the 900 s Cloud Run request timeout) and `EventSource` reconnects, and screens close theirs when hidden (the phone and `/demo` also when idle; a visible kiosk never pauses, I-172), because an open stream keeps an instance billed as active (12-phone-app:7); a little extra latency through the server. The in-memory store works only on a single instance, so production must use Firestore.

### ADR-011: Model ids
**Decision** (10-12): text agent `gemini-3.8-flash`, voice `gemini-3.8-live` (fallback `gemini-3.1-flash-live-preview`), set by `GEMINI_TEXT_MODEL` and `GEMINI_LIVE_MODEL`. Both appear in the Gemini API `models.list` for our key on 10-12, and an ephemeral token with `liveConnectConstraints` connected to `gemini-3.8-live` and returned audio on 10-12 (manual check, no saved log).
**Backend** (10-13): text agent on Vertex AI since 10-13 (the Gemini API key's prepaid credits ran out, I-104); voice on the Gemini API for ephemeral tokens. Later on 10-13 (credits topped up): text agent `GEMINI_TEXT_BACKEND=auto`, the Gemini API key first because it was faster and Vertex returned 429s during an eval (I-105, I-111), and Vertex AI once per call on 402, 429 or 5xx/network errors, so a credit outage no longer stops text ordering. Voice falls back too since 12-phone-app:9 (ADR-012).
**Why**: `gemini-3.8-live` is not a preview id, which matters for three weeks of judging.
**Trade-off**: Re-check `models.list` before the deadline and before judging starts.

### ADR-012: Voice fallback through a Vertex Live relay
**Decision** (10-13, 12-phone-app:9): `GEMINI_LIVE_BACKEND=auto` (default). `POST /api/live-token` answers `{ mode: "direct", token, … }` (ADR-003) while the Gemini API key can generate, and `{ mode: "relay", url }` when it cannot: a 402 (prepaid credits used up) or no key, seen by the token issuer or by a cached probe (one output token on the key, at most once a minute per instance; a "down" result holds for 10 min). The phone then opens a WebSocket to `kibo-voice` (`voice-relay/`, built in 12-phone-app:8), a second Cloud Run service that opens Vertex AI Live with the runtime service account and passes Live's messages through. `api` and `vertex` pin one path; without `VOICE_RELAY_URL`, `auto` stays direct. Every reconnect asks `/api/live-token` again, so a topped-up key brings the phone back to the direct path.
**Why**: Gemini Live ephemeral tokens exist only on the Gemini API, whose prepaid credits ran out twice on 10-13 (I-104) and stopped voice each time until a person topped up. Vertex AI is billed after use to the Cloud account, so voice keeps working through three weeks of judging. The direct path stays first because it has one hop less and was measured first (first audio median 2,070 ms on 10-12, `evidence/voice-e2e.json`; on 10-14 and 10-15 with the fixed fixtures, 2,382 ms direct and 2,841 ms through a local relay, 4 runs each; the kiosk highlight 1,669 and 1,715 ms; too few runs to tell the two paths apart, and the relay's latency on Cloud Run is still unmeasured).
**Alternatives**: top up the credits only (a person must watch the balance for three weeks; it ran out without warning twice in one day); always use the relay (one more hop and a second service on every voice turn, and its latency through Cloud Run is unmeasured); another vendor's realtime voice (the rules require Gemini/Google AI for the product).
**Trade-off**: A second service to deploy and watch (`/api/health?deep=1` checks it as `liveRelay`), in `us-central1` for Vertex Live (`gemini-3.8-live` was served only there on 10-13), so audio crosses the Pacific twice. The relay's latency on Cloud Run is unmeasured; the local relay E2E is in `evidence/voice-e2e-relay.json`. The probe costs one output token a minute while voice is used.
