# Step 4: api-routes

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: ARCHITECTURE "API" (routes, common rules, error codes, endpoints), "Limits and cost" (per-IP), ADR-010 (SSE); SECURITY "Identity and permissions", "Abuse and cost".
- `AGENTS.md`, then the Next.js 16.4 route handler guide in `node_modules/next/dist/docs/` (route handlers, dynamic params as a Promise, streaming, `cacheComponents` which is on in `next.config.ts`).
- `src/lib/session/service.ts`, `src/lib/store/*`, `src/lib/commands/*`, `src/lib/tokens.ts`, `src/app/api/health/route.ts` (steps 0–3).

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
HTTP routes over the session service. **Tests first** (`src/app/api/**/route.test.ts` calling the exported handlers with `new Request(...)` and `STORE=memory`).

### Shared helpers: `src/lib/http.ts`
```ts
export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown>   // 413-like → BAD_REQUEST when larger, BAD_REQUEST on invalid JSON
export function bearer(req: Request): string | null                                   // "Authorization: Bearer <token>"
export function ok(body: object, init?: ResponseInit): Response                       // { ok: true, ...body }, Cache-Control: no-store
export function fail(err: unknown): Response   // CommandError → { ok:false, error:{ code, message, detail? } } with HTTP_STATUS; anything else → 500 INTERNAL (below)
export function clientIp(req: Request): string                                         // LAST X-Forwarded-For value (Cloud Run appends it), else "local"
export function publicOrigin(req: Request): string                                     // x-forwarded-proto + x-forwarded-host, else host header, else new URL(req.url).origin
```
- Unknown errors: log `console.error` with the error name only (no request body, no tokens), respond 500 `{ ok:false, error:{ code:"INTERNAL", message:"Something went wrong. Please try again." } }`. Add `"INTERNAL"` to `ErrorCode` with status 500.
- Messages are plain words; never stack traces, ids or model text.

### Per-IP limits: `src/lib/limits/ip.ts`
In-memory fixed one-minute windows keyed by `clientIp`: 60 API requests per minute for every route below, plus 10 `POST /api/session` per minute. Over the limit → `CommandError("RATE_LIMITED", "Too many requests. Please wait a moment.")`. Export a `resetLimits()` for tests. (Per Cloud Run instance; ARCHITECTURE notes the 3× effect.)

### Routes (all `runtime = "nodejs"`; all bodies parsed with zod before use)
| Route | Behaviour |
|---|---|
| `POST /api/session` | body `{ kioskId, demo? }` → `createSession` → `{ sessionId, claimUrl: \`${publicOrigin}/assistant?s=${sessionId}#t=${claimToken}\`, kioskToken, expiresAt, deviceToken? }` |
| `POST /api/session/claim` | body `{ sessionId, claimToken }` → `{ deviceToken, status }` |
| `POST /api/command` | `runCommand({ body, bearer })` → `CommandResponse`; for `reissueClaim` also return `claimUrl` built from the new claim token |
| `POST /api/ping` | body `{ sessionId, active }` + bearer → `{ status, expiresAt, serverTime }` |
| `GET /api/session/[id]/events` | SSE (ADR-010): `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`. On connect `store.subscribe(id)`; every value is sent as `data: <JSON of the public session>\n\n` (unknown id → one `event: gone` and close). A `: keepalive` comment every 25 s. Unsubscribe and clear timers when `req.signal` aborts or the stream is cancelled. The id must match `^[A-Za-z0-9_-]{16,64}$`. |
| `GET /api/health` | keep `ok`, add `version` (from `package.json`), `store` (`memory`/`firestore`), `revision` |

- The public session JSON is the `Session` object as stored (it holds no secrets; `sessionSecrets` is never sent). Write `toPublicSession(s)` that copies only the fields of the `Session` type, so a future field added to secrets cannot leak by accident.
- Make sure `npm run build` lists the API routes as dynamic (ƒ) and the SSE route streams instead of buffering. With `cacheComponents` on, follow the Next 16 docs for dynamic route handlers; do not add config the docs say is incompatible.

### Response headers for the whole app (`next.config.ts` `headers()`)
`Referrer-Policy: no-referrer` (the claim token travels in the URL fragment), `X-Content-Type-Options: nosniff`, `Permissions-Policy: microphone=(self), camera=()`.

### Tests (at least)
- create → claim → command (`addToCart` hero line via device token) → response cart and total; duplicate `commandId` → `duplicate: true`;
- error shape and HTTP status for `BAD_REQUEST` (bad JSON, unknown type, > 64 KB body), `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `NEEDS_CHOICE` (detail has choices);
- `claimUrl` uses `x-forwarded-host`/`x-forwarded-proto` when present; the claim token is only in the fragment;
- per-IP: the 11th session create in a minute → 429; `clientIp` takes the last `X-Forwarded-For` hop;
- SSE: the first chunk contains the session JSON; after a command the next chunk has the new `cartVersion`; aborting the request unsubscribes (check with a spy on the store or a listener count);
- health returns `ok: true` and `store`.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```
Then a manual smoke test with the dev server (memory store): start `npm run dev` in the background on a free port, `node -e` a script that creates a session, claims it, adds a cheeseburger set with zero cola, and reads one SSE event; stop the server. Report the result in the summary.

## Verify
1. Run the AC commands and the smoke test.
2. Check: error codes and statuses match ARCHITECTURE; no token, hash or body is logged; `sessionSecrets` never leaves the server.
3. Update this step in `phases/1-core/index.json` (completed + summary / error / blocked).

## Do not
- Do not let clients write or read Firestore directly (ADR-010).
- Do not trust any price, total, name or state from the request body.
- Do not log request bodies, utterances or tokens (SECURITY "Secrets and repo hygiene").
- Do not add UI pages; the next phase builds the kiosk.
- Break existing tests.
