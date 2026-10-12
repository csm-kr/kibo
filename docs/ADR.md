# Architecture Decision Records

## Philosophy
Ship one vertical demo that works end to end and survives three weeks of public judging. Prefer the simplest design that keeps the voice-to-kiosk loop under ~3 s and the payment step safe. Every number we show must come from a saved measurement.

---

### ADR-001: One Next.js app on Cloud Run
**Decision**: A single Next.js (App Router, TypeScript, Tailwind) app serves `/kiosk`, `/assistant`, `/demo` and `/api/*`, deployed to Cloud Run in `asia-northeast3`, `min-instances=1`, `max-instances=3`.
**Why**: Screens share components, one deploy, HTTPS by default (needed for the mic). Hackathon rules require Cloud Run or Firebase.
**Trade-off**: No separate realtime server; we rely on Firestore for sync.

### ADR-002: Firestore session document is the single source of truth
**Decision**: `sessions/{id}` holds cart, status, highlight info. Clients only `get` and `onSnapshot`; all writes go through `POST /api/command` in a transaction.
**Why**: Two screens stay in sync without WebSockets; validation, idempotency and state transitions live in one place.
**Trade-off**: Each change costs one server round trip. Touch navigation therefore stays local on the kiosk; only cart changes go to the server, with optimistic UI.

### ADR-003: Phone talks to Gemini Live directly
**Decision**: The phone opens a Gemini Live session with a server-issued ephemeral token (`uses: 1`, model, instructions and tools pinned by `liveConnectConstraints`). Function calls are forwarded to `/api/command`. A text agent at `/api/chat` uses the same `lib/agent` definitions.
**Why**: No audio relay through our server, lower latency and cost. The text path is the fallback if Live is unstable.
**Trade-off**: Tool arguments arrive from the browser and must be fully validated server-side (zod, catalog membership, ranges).

### ADR-004: Whole menu in the instructions, 9 tools
**Decision**: The catalog (~35 items with option groups) goes into the agent instructions. Tools: `setDineOption`, `addToCart`, `updateCart`, `removeFromCart`, `undoLastChange`, `offerChoices`, `callStaff`, `requestCheckout`, `confirmCheckout`. Mutating tools return the updated cart.
**Why**: One tool call per sentence instead of search-then-add; meets the latency target.
**Trade-off**: Very large menus need a `searchMenu` tool; the adapter decides.

### ADR-005: Server-enforced session state machine
**Decision**: `idle → connected → ordering ⇄ confirming → paying → paid`, plus `paying → ordering` (edit) and `expired`. `confirmCheckout` is accepted only in `confirming`, after a new user utterance, with a matching `cartVersion`. `paid` comes only from the kiosk card action with a `kioskToken`.
**Why**: The AI can never skip the confirm card or complete a payment.
**Trade-off**: More server logic and tests.

### ADR-006: Actor tokens
**Decision**: QR claim token (one use) → `deviceToken` for the phone; `kioskToken` for the kiosk/bridge. Secrets live in `sessionSecrets/{id}` (server only). Allowed commands are a per-actor table.
**Why**: The session id is public in the QR; without actor tokens anyone could change the cart or mark it paid.
**Trade-off**: Token handling on reconnect (stored in localStorage per kiosk/phone).

### ADR-007: KIBO Learn, learn once and replay without AI
**Decision**: For kiosks without integration, an offline learner drives the kiosk UI (Playwright, accessibility tree + "tappable labels" from clickable elements), records findings, writes a skill (catalog + click recipes), and may only finish after the skill passes ≥3 self-tests. At runtime an in-page bridge script replays recipes and verifies the kiosk's own total and cart lines. No runtime self-healing; on failure, stop and hand over to staff or touch.
**Why**: Per-order vision control is slow, costly and non-deterministic. Replay is ~1 s and auditable.
**Trade-off**: Web/webview kiosks only; quantity and conditional options are still weak; skills must be re-learned when the kiosk UI changes.

### ADR-008: Model and vendor use
**Decision**: The product uses Gemini only (Live, Flash, Vertex for learning). OpenAI (`gpt-6.1-sol`) is used only during development to iterate on the learner; numbers shown in the deck and video are re-measured with Gemini. Menu and promo images are generated offline (Codex image generation; earlier ones with Gemini image generation).
**Why**: Hackathon rules require Gemini/Google AI; development credits are cheaper on OpenAI.
**Trade-off**: Two learner backends to keep in sync (`PROVIDER=gemini|openai`).

### ADR-009: Menu data in the repo, not Firestore
**Decision**: Direct-adapter menus live in `data/kiosks/*.json`; learned kiosks in `skills/*.json`. Firestore stores sessions only.
**Why**: No seed scripts, no read latency, the menu never changes during the demo.
**Trade-off**: Menu edits need a deploy.
