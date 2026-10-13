# Security and reliability

KIBO is a public demo that must stay up for three weeks of judging, handles a (simulated) payment step, and receives tool calls from browsers. These are the controls the implementation must have. They came from an adversarial review of the design (attacker and QA view).

## Trust boundaries
- **Browsers are untrusted.** The phone forwards Gemini function calls; anyone can forge them. The server validates everything.
- **Kiosk page text is untrusted.** Learned menu names flow into prompts and validation rules.
- **The session id is public** (it is in the QR). Possession of the id grants read access to the session stream only.

## Identity and permissions
- One-use QR claim token → `deviceToken` for the phone. Same phone can reconnect; another phone sees "someone else is using this kiosk".
- `kioskToken` for the kiosk and the learned-kiosk bridge.
- Per-actor command table: card action and touch commands require `kioskToken`; AI tools and phone buttons require `deviceToken`. `/demo` receives both.
- Secrets (`claimTokenHash`, `deviceTokenHash`, `kioskTokenHash`) live in `sessionSecrets/{id}`, which clients cannot read.
- The claim token travels in the URL fragment (`#t=`) and is removed after claiming; `Referrer-Policy: no-referrer`.
- A kiosk can issue a fresh QR ([Connect another phone]) to release a session held by a lost phone. `/demo` hides the button, because the page's own phone half holds that session.

## Firestore rules
- Clients have no Firestore access at all: every read and write is denied (ADR-010). Screens read the session through the SSE route `GET /api/session/{id}/events`, which sends only the public session document, never `sessionSecrets`.
- Session ids are random 128-bit values. Anyone holding the id (it is in the QR) can read the cart through the stream, so the session document holds no personal data or free text.

## Command handling
- Every change goes through `POST /api/command` inside a Firestore transaction.
- Idempotency: `commandId` (`<liveSessionId>:<functionCallId>` for voice, `<chatRequestId>:<n>` for text, a uuid for buttons and touch) checked against `recentCommandIds` (last 30); a retry applies nothing and returns the current state with `duplicate: true` and the first response's `result` (last 10 kept in `sessionSecrets.recentResults`, server only, never streamed). A claim token is never stored: a repeated `reissueClaim` rotates again and returns a fresh one, and only before `paying`.
- `source` is bound to the actor: the kiosk and the learned-kiosk bridge send only `touch`; the phone sends `voice`, `text` or `button`; anything else is `BAD_REQUEST`. The server trusts the phone's `button` as a tap (it confirms a payment without an utterance), so the phone code must set `button` only from real taps, never from a tool call.
- `sessionId` must match `^[A-Za-z0-9_-]{16,64}$` on every route that takes one, before the store sees it (a `/` would otherwise reach a Firestore document path).
- zod schemas for every tool: quantity integer 1–10, ≤ 20 lines, options must belong to the item's groups, string lengths capped. `offerChoices` accepts catalog ids and a template id only; the server builds the question and labels. Kiosk banners use fixed text, never model text. Session documents hold no free text: staff calls store a reason code. No model text is rendered as HTML.
- State machine enforced on the server (`docs/ARCHITECTURE.md`). `confirmCheckout` needs `confirming` and a matching `cartVersion`, plus either a tap on the confirm card or, for an AI call, a new user utterance after the card appeared and at least 1.5 s after it. An AI confirm needs a review the phone's AI opened (`checkoutUtteranceSeq` not null): a review the kiosk opened or `editOrder` reopened has a null `checkoutUtteranceSeq`, so the phone must tap the card (an AI confirm gets `CONFLICT` "Please confirm on the card."). In `/api/chat` one request counts as one utterance, and `history` may hold only user and model text. `paid` only comes from the kiosk card action.
- A cart change while confirming returns to `ordering`; a dine-option change while confirming adds 1 to `cartVersion`, so a card showing the old option cannot confirm. Undo is refused in `paying`/`paid`.

## Gemini Live tokens
- `uses: 1`, short expiry, model/instructions/tools pinned with `liveConnectConstraints`, issued only to a valid `deviceToken`, counted per session and per day. (Check whether `expireTime` closes an already open connection.)

## Abuse and cost
- `max-instances=3`, per-IP rate limit (last `X-Forwarded-For` hop; IPv6 by /64 prefix), per-session and daily caps on voice and chat, input and output limits, Gemini per-minute quota cap. Details in `docs/ARCHITECTURE.md`.
- Unauthenticated `POST /api/session` is rate-limited; sessions expire via TTL.

## Learned kiosks (KIBO Learn)
- Skills are validated against a schema (names ≤ 40 chars, no newlines, integer prices) and reviewed by a person before commit.
- The menu goes into instructions as a JSON block marked as data.
- **No runtime self-healing:** a failing recipe stops; the cart is re-read from the kiosk and the user is offered staff or touch. No automatic retry (double-add risk).
- Recipe variables are checked against the skill catalog **before** any click. The bridge refuses forbidden labels (pay, card, complete order).
- The bridge sends only order values, never code; it authenticates with `kioskToken` in an `Authorization` header (no cookies, so no CSRF); CORS allows exact origins only.
- Commands are executed one at a time. Before each, the bridge checks the current screen (an idle kiosk is restarted and the cart re-added). Verification checks the kiosk's total **and** each cart line's text.

## Secrets and repo hygiene
- Keys only in `.env` (git-ignored) or Secret Manager; never printed or logged.
- The Cloud Run runtime service account `kibo-runtime` has only `datastore.user`, `secretmanager.secretAccessor` (the `gemini-api-key` secret) and, since 10-13, `aiplatform.user` (the text agent on Vertex AI, which needs no key).
- Logs record tool names and results only; no utterances, no free-text reasons (they may contain health information).
- Before the repo goes public: scan the full history with gitleaks.
- A project hook (`scripts/hooks/guard_bash.py`) blocks destructive shell commands and reading `.env` during agent sessions.

## Reliability
- Kiosk stores `{sessionId, kioskToken}` per kiosk in localStorage and resumes after a reload unless expired or paid.
- Phone heartbeat every 30 s; the kiosk shows "connection paused" after 60 s. Expiry is extended only when the user was active in the last 30 s; the kiosk corrects for server clock offset.
- Live reconnect with a fresh token; GoAway handled; `/demo` falls back to text automatically.
- Only one tab per phone holds a Live session (`navigator.locks`); [Try again] and `paid` close the Live session.
- `/api/health` + Cloud Monitoring uptime check on `/api/health?deep=1` (store, both model ids, a 1-token generation through the text backend and on the API key, and an ephemeral token) with email alerts to both team members. Model ids in environment variables.
