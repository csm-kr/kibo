# Phase 1-core QA report (step 5)

Date 10-12. Scope: menu data, cart engine, state machine, session store, API routes. No screens were built in this phase.

Automated checks (run in this session): `npm run lint` clean; `npm run build` ok (all `/api/*` routes dynamic); `npm run test` 14 files passed, 1 skipped (Firestore integration, needs `FIRESTORE_IT=1`), 203 tests passed; `python3 design/prototype/e2e_check.py` 42 pass, 0 fail.

## Angles
| # | Angle | Result | Issues |
|---|---|---|---|
| A | Numbers | n/a: no screens in this phase | |
| B | Visual heuristics | n/a: no screens in this phase | |
| C | Flows | pass, except learned-kiosk replay (phase 6) | I-029 |
| D | Journeys | n/a: no screens in this phase | |
| E | Nielsen 10 | pass for the server side (3, 5, 9); heuristic 9 copy is English only | I-031 |
| F | Accessibility | n/a: no screens in this phase | |
| G | Content | pass: no real brands, no health or religious claims, 354 names all ≤ 40 chars, prices only from `malo.json`, messages carry menu names, never ids | I-031 |
| H | First 20 seconds | n/a: no screens in this phase | |
| I | Rules | pass: R-001, numbers added to ARCHITECTURE this phase are design limits (64 KB, 25 s keepalive, 60/10 per IP), not measured claims; R-002 applied to every contract fixed here | I-030 |

## Angle C and E: can the server support each UX row?
| UX row | Server support |
|---|---|
| Flow A (QR → mic → dine → talk → edit → upsell → confirm → card → number) | `POST /api/session`, `claim` (`idle → connected`), `setDineOption`, `addToCart`/`updateCart`, `result.upsell` once per order, `requestCheckout`, `confirmCheckout` (tap or new utterance + 1.5 s), kiosk `cardAction` → `paid` + `orderNumber`; new session after paid = new `POST /api/session` |
| Flow B (touch, then QR mid-order) | `startTouch`, kiosk cart commands, `clearCart`, claim keeps `ordering` |
| Flow C (`/demo`) | `demo: true` returns both tokens, status `connected`; card stand-in = `cardAction` with the demo `kioskToken`. Voice/chat caps come with phases 3–4 |
| Misheard → undo | `undoLastChange` (5 deep), refused in `paying`/`paid` |
| Ambiguous → choices | `NEEDS_CHOICE` with `detail.choices`; `offerChoices` (catalog ids only) → `pendingChoice` |
| Sold out → alternatives | `SOLD_OUT`/`UNAVAILABLE` with up to 2 same-category alternatives |
| Not in data / stuck → staff | `callStaff` with a reason code → `staffCalled` |
| Phone off / reconnect | stored `deviceToken` keeps working; `ping` sets `phoneSeenAt` for "connection paused" |
| Idle warning [Continue] | `expiresAt` + `serverTime` from `ping`; `ping active:true` extends |
| Someone else scans | claim → `CONFLICT` "Someone else is using this kiosk." |
| Change of mind at payment | kiosk `editOrder` → `confirming` |
| Learned kiosk replay fails | **not yet**: `bridgeReport`, `pendingBridgeCommand` are phase 6 |
| Noise | client only (phases 3–4) |

Safety gap found: an AI confirm after a kiosk-opened review or after `editOrder` does not prove a fresh utterance (I-029, P1, step 2 specified this behavior; decide before phase 4).

## Contract drift
Fixed in docs (code follows an explicit step 2 rule, R-002):
- ARCHITECTURE command table: `startTouch` no-op in `connected`/`ordering`; `setDineOption` from `idle` (kiosk) and in `confirming`; `callStaff` refused only when `expired`, the only command in `paid`; null `checkoutUtteranceSeq` counts as -1 (superseded 10-12 by 2-kiosk step 0, I-029: null now refuses AI confirms); kiosk confirm needs `source: "touch"` (I-024).
- Sessions table heading: server only, clients read through SSE (I-025); added `sessionId`, `demo`; `lastChange.lineId` null for undo and clear.

Matches the docs: routes and response shapes (`/api/session`, `claim` `{deviceToken,status}`, `command` incl. `duplicate` and `claimUrl`, `ping` `{status,expiresAt,serverTime}`, SSE `data:`/`event: gone`, `health` `{ok,service,version,store,revision,time}`); error codes and HTTP statuses (incl. `INTERNAL` 500); actor table; `/api/command` processing order (zod → token → actor → duplicate → state → catalog → commit).

Not built yet, planned in later phases (no issue): `pendingBridgeCommand`, `bridgeReport`, `cardAction` refusal for learned kiosks (phase 6); `sessionSecrets.chatCount`/`liveTokenCount`, daily `usage` (phases 3–4).

Logged: `metrics` session field has no code or step (I-030); server error messages are English only with no localization contract (I-031).

SECURITY: tokens are 32 random bytes, stored as SHA-256 hashes, compared with `timingSafeEqual` (`src/lib/tokens.ts`); session ids 16 random bytes; secrets live only in `sessionSecrets` and `toPublicSession` copies public fields one by one; the only log line is the error name (`src/lib/http.ts:56`); per-IP limit keys on the last `X-Forwarded-For` hop (`clientIp`); `Referrer-Policy: no-referrer`, `nosniff`, `Permissions-Policy` in `next.config.ts`; claim token only in the URL fragment; `firestore.rules` present.

## Security spot checks
Route-level tests, run in this session (`src/app/api/command/route.test.ts` "security spot checks", `src/app/api/session/[id]/events/route.test.ts`):
| Attempt | Expected | Result |
|---|---|---|
| `cardAction` with the device token (also while `paying`) | 403 `FORBIDDEN` | pass |
| `confirmCheckout` in `ordering` (phone button, kiosk touch) | 409 `CONFLICT` | pass |
| Option from another item (`drink: sweet_chili`), group from another item (`sauce`) | 400 `BAD_REQUEST` | pass |
| 1,000-character `sessionId`, `commandId`, `itemId`, `lineId`, SSE path id | 400 `BAD_REQUEST` | pass |
| 70 KB body | 400 `BAD_REQUEST` | pass (existing test) |
