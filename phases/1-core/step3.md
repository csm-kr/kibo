# Step 3: session-store

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: ADR-002, ADR-006, ADR-010; ARCHITECTURE "Patterns", "Database (Firestore)", "Environment variables"; SECURITY "Identity and permissions", "Command handling", "Reliability".
- `src/types/session.ts`, `src/lib/commands/*.ts` and tests (steps 1–2), `src/lib/adapters/catalog.ts`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Storage behind an interface, actor tokens, and the session service that combines store + machine. **Tests first** for tokens, the memory store and the service.

### Tokens: `src/lib/tokens.ts` (Node `crypto`)
```ts
export function newToken(): string              // 32 random bytes, base64url
export function newSessionId(): string           // 16 random bytes (128 bit), base64url
export function hashToken(token: string): string // SHA-256 hex
export function tokenMatches(token: string, hash: string | null): boolean   // constant time (timingSafeEqual), false for null
```

### Store: `src/lib/store/`
```ts
// types.ts
export interface SessionSecrets { claimTokenHash: string; claimed: boolean; deviceTokenHash: string | null; kioskTokenHash: string; createdAt: number; expiresAt: number }
export interface SessionStore {
  create(session: Session, secrets: SessionSecrets): Promise<void>;
  get(sessionId: string): Promise<Session | null>;
  // fn may run more than once (Firestore retries on contention), so it must be pure.
  // Throwing inside fn aborts the transaction and rethrows.
  transact<T>(sessionId: string, fn: (s: Session | null, sec: SessionSecrets | null) => { session?: Session; secrets?: SessionSecrets; value: T }): Promise<T>;
  subscribe(sessionId: string, onChange: (s: Session | null) => void): () => void;   // calls onChange with the current value first
}
export function getStore(): SessionStore   // index.ts: singleton; STORE=firestore|memory, default firestore when NODE_ENV=production, else memory
```
- `memory.ts` `MemoryStore`: `structuredClone` on every read and write; transactions on the same session run one after another (a promise chain per id); `subscribe` notifies asynchronously after each committed write. A test-only `reset()` is fine.
- `firestore.ts` `FirestoreStore`: `firebase-admin` (`initializeApp()` once with application default credentials, project from `GOOGLE_CLOUD_PROJECT` or the default), collections `sessions` and `sessionSecrets`, both documents read and written in one `runTransaction`. Convert `expiresAt` and `createdAt` to Firestore `Timestamp` on write and back to epoch ms on read (the TTL policy on `expiresAt` is already enabled for both collections). `subscribe` uses `onSnapshot` on `sessions/{id}`. Import `firebase-admin` lazily inside `getStore()`'s firestore branch so tests and `STORE=memory` never load it.
- `firestore.it.test.ts`: an integration test that is **skipped unless `FIRESTORE_IT=1`** (create → transact → subscribe sees the change → clean up by setting `expiresAt` in the past). Add `"test:firestore": "FIRESTORE_IT=1 STORE=firestore vitest run src/lib/store/firestore.it.test.ts"` to `package.json` and run it once: the machine has gcloud application default credentials for project `kibo-2026`, and Firestore (default database, `asia-northeast3`) exists. If it fails for credentials or network, do not block: note it in the summary and in `docs/ISSUE.md`.

### Session service: `src/lib/session/service.ts`
```ts
export interface CreateResult { sessionId: string; claimToken: string; kioskToken: string; deviceToken?: string; expiresAt: number }
export async function createSession(store, input: { kioskId: string; demo?: boolean }, now: number): Promise<CreateResult>
export async function claimSession(store, input: { sessionId: string; claimToken: string }, now: number): Promise<{ deviceToken: string; session: Session }>
export async function runCommand(store, input: { body: unknown; bearer: string | null }, now: number): Promise<CommandResponse>
export async function ping(store, input: { sessionId: string; bearer: string | null; active: boolean }, now: number): Promise<{ status: SessionStatus; expiresAt: number; serverTime: number }>
export interface CommandResponse { ok: true; status: SessionStatus; cart: CartLine[]; total: number; cartVersion: number; result?: CommandResult & { claimToken?: string }; duplicate?: boolean }
```
- `createSession`: unknown kiosk → `BAD_REQUEST`. New ids and tokens; secrets store only hashes. `demo: true` also issues a `deviceToken`, marks the secrets `claimed`, sets `phoneConnectedAt`, and the status becomes `connected` (the `/demo` page holds both tokens).
- `claimSession`: no session → `NOT_FOUND`; expired → `GONE`; wrong claim token → `UNAUTHORIZED`; already claimed → `CONFLICT` with message "Someone else is using this kiosk." Success: new `deviceToken`, `claimed: true`, status `idle → connected` (other statuses unchanged, so a mid-order claim keeps `ordering`), `phoneConnectedAt = phoneSeenAt = now`, `expiresAt` extended.
- `runCommand`: `parseCommand(body)` first; in one `transact`: missing session → `NOT_FOUND`; actor = `kiosk` if `tokenMatches(bearer, kioskTokenHash)`, else `phone` if it matches `deviceTokenHash`, else `UNAUTHORIZED`; `applyCommand` with `newLineId` (8 random bytes base64url) and `newOrderNumber` (101–999); for `reissueClaim` also rotate `claimTokenHash`, set `claimed: false`, `deviceTokenHash: null`, `phoneConnectedAt: null` and return the new `claimToken` in `result` (the kiosk builds the new QR). When `applyCommand` reports a past expiry, write `status: "expired"` before throwing `GONE`, so screens see it.
- Randomness for ids/tokens/order numbers is generated **outside** `fn` and passed in, so a Firestore retry does not change them.
- `ping`: any actor token; `lastSeenAt = now`; phone also `phoneSeenAt = now`; `active` extends `expiresAt` to `now + 10 min`; returns `serverTime` so screens can correct clock offset.

### Tests (memory store)
- tokens: lengths, hash is hex 64, `tokenMatches` true/false/null;
- create → claim → second claim `CONFLICT`; wrong claim token `UNAUTHORIZED`; claim during `ordering` keeps `ordering`; demo session has a device token and status `connected`;
- `runCommand` with no/wrong bearer → `UNAUTHORIZED`; phone `cardAction` → `FORBIDDEN`; a full order by kiosk token reaches `paid`;
- two concurrent `addToCart` (`Promise.all`) both apply (cartVersion +2), neither overwrites the other;
- the same `commandId` sent twice concurrently applies once;
- `reissueClaim` → old device token now `UNAUTHORIZED`, new claim works;
- `subscribe` receives the change after `runCommand`;
- the session document passed to `subscribe` never contains token hashes.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:firestore   # see the note above if credentials are unavailable
```

## Verify
1. Run the AC commands.
2. Check: secrets only in `sessionSecrets`; no token or hash logged; `firebase-admin` not imported by client code.
3. Update this step in `phases/1-core/index.json` (completed + summary / error / blocked).

## Do not
- Do not store raw tokens, only SHA-256 hashes (SECURITY "Identity and permissions").
- Do not put side effects (random ids, clock reads, logging) inside the transaction function, because Firestore may run it several times.
- Do not create Firestore indexes or seed data; menus stay in the repo (ADR-009).
- Do not add HTTP routes; the next step does that.
- Break existing tests.
