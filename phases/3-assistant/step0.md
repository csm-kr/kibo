# Step 0: core-hardening

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: ARCHITECTURE "API" (idempotency: a repeated `commandId` returns the current state and applies nothing), "Commands and actors", ADR-010; SECURITY "Command handling", "Abuse and cost"; RULE R-002.
- Code: `src/lib/store/{firestore,memory,types,index}.ts`, `src/app/api/session/[id]/events/route.ts`, `src/lib/commands/{machine,schemas}.ts`, `src/lib/session/service.ts`, `src/lib/http.ts`, `src/lib/limits/ip.ts`, `src/app/api/{ping,session/claim,command}/route.ts` and their tests.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
An independent review of phase 1 (10-12, read-only agent) found no path to `paying`/`paid` outside the rules, but seven real defects. Fix them here, **each with a failing test first**, and log them in `docs/ISSUE.md` (area `api` or `db`, reuse classes where the cause matches; mark each fixed with how).

## Task
1. **SSE stalls when the Firestore listener fails** (`store/firestore.ts` `subscribe` has no error callback; the 25 s keepalive hides it, so `EventSource` never reconnects and screens freeze until the Cloud Run timeout). Add `onError?: (e) => void` to `SessionStore.subscribe`; FirestoreStore passes `onSnapshot`'s error callback; the SSE route closes the stream on error (the browser reconnects). MemoryStore: add a test-only way to simulate an error. Test: an error closes the stream and unsubscribes.
2. **Firestore init failure is cached forever** (`loaded ??=` keeps a rejected promise; `void load().then(...)` has no `.catch`). Reset the cache on failure so the next request retries; route the error to `onError`. Test with an injected failing loader.
3. **Dine option change during `confirming` does not bump `cartVersion`**, so an old confirm card can pay for a changed order. In `confirming`, a `setDineOption` that changes the value increments `cartVersion` (the confirm card re-renders; a stale tap gets `CONFLICT`). Test.
4. **A retried `commandId` loses the first response's `result`** (addToCart's `lineId`/`upsell`; reissueClaim's new claim token). Keep the last 10 results in `sessionSecrets.recentResults: [{ commandId, result }]` (server only; never streamed) and return them on a duplicate. For `reissueClaim`, store only that it ran, and on a duplicate rotate again and return a fresh claim token (the old one is already invalid, so rotating twice is safe). Update ARCHITECTURE (`sessionSecrets` fields, idempotency sentence) per R-002. Tests for both.
5. **`source` is not bound to the actor.** Phone commands may use `voice`, `text` or `button`; kiosk commands may use only `touch` (the learned-kiosk bridge is a kiosk actor and uses `touch` too). Anything else → `BAD_REQUEST`. Note in SECURITY "Command handling" that the phone's `button` source is trusted as a tap, so the phone code must set it only from real taps. Tests.
6. **`sessionId` characters are not validated** in the command envelope, `/api/ping`, `/api/session/claim` (and any other body that carries it). Use one shared `SESSION_ID` regex (`^[A-Za-z0-9_-]{16,64}$`, the SSE route's) everywhere; `a/b` → `BAD_REQUEST`, never a 500. Tests.
7. **Per-IP limits can be bypassed by rotating IPv6 addresses.** Key IPv6 addresses by their /64 prefix (IPv4 unchanged). Test with two addresses in the same /64.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
```

## Verify
1. Run the AC commands.
2. R-002: grep `docs/` and `phases/` for `recentResults`, `source`, `subscribe(` and make every statement match the code.
3. Update this step in `phases/3-assistant/index.json` (completed + summary / error / blocked).

## Do not
- Do not loosen any confirm or payment rule.
- Do not stream anything from `sessionSecrets`.
- Break existing tests.
