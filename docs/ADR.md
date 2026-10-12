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
**Trade-off**: Tool arguments arrive from the browser and must be fully validated server-side (zod, catalog membership, ranges).

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
**Decision**: For kiosks without integration, an offline learner drives the kiosk UI (Playwright, accessibility tree + "tappable labels" from clickable elements), records findings, writes a skill (catalog + click recipes), and may only finish after the skill passes ≥3 self-tests. At runtime an in-page bridge script replays recipes and verifies the kiosk's own total and cart lines. No runtime self-healing; on failure, stop and hand over to staff or touch.
**Why**: Per-order vision control is slow, costly and non-deterministic. Replay took 0.7–5.2 s per order in our test (4 orders, `spikes/kibo-learn/results/holdout.run2.log`) and is auditable.
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
**Trade-off**: Each open screen holds one Cloud Run request (concurrency 80 per instance, `max-instances=3`), streams end at the Cloud Run request timeout and `EventSource` reconnects; a little extra latency through the server. The in-memory store works only on a single instance, so production must use Firestore.

### ADR-011: Model ids
**Decision** (10-12): text agent `gemini-3.8-flash`, voice `gemini-3.8-live` (fallback `gemini-3.1-flash-live-preview`), set by `GEMINI_TEXT_MODEL` and `GEMINI_LIVE_MODEL`. Both appear in the Gemini API `models.list` for our key on 10-12, and an ephemeral token with `liveConnectConstraints` connected to `gemini-3.8-live` and returned audio on 10-12 (manual check, no saved log).
**Backend** (10-13): text agent on Vertex AI since 10-13 (the Gemini API key's prepaid credits ran out, I-104); voice on the Gemini API for ephemeral tokens. Later on 10-13 (credits topped up): text agent `GEMINI_TEXT_BACKEND=auto`, the Gemini API key first because it was faster and Vertex returned 429s during an eval (I-105, I-111), and Vertex AI once per call on 402, 429 or 5xx/network errors, so a credit outage no longer stops text ordering; voice cannot fall back, it needs the key.
**Why**: `gemini-3.8-live` is not a preview id, which matters for three weeks of judging.
**Trade-off**: Re-check `models.list` before the deadline and before judging starts.
