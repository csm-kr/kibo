# Step 2: state-machine

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: ARCHITECTURE "Session state machine", "Commands and actors", "`/api/command` processing order", "sessions/{sessionId}"; ADR-005, ADR-006; SECURITY "Command handling"; TESTING "Unit tests".
- `src/types/menu.ts`, `src/types/session.ts`, `src/lib/adapters/catalog.ts`, `src/lib/commands/errors.ts`, `src/lib/commands/cart.ts` and their tests (steps 0–1).

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
The pure session state machine: given a session, an actor and a command, return the next session or throw `CommandError`. **Tests first** (`src/lib/commands/machine.test.ts`), then code. No I/O.

### Session document: add to `src/types/session.ts`
```ts
export type SessionStatus = "idle" | "connected" | "ordering" | "confirming" | "paying" | "paid" | "expired";
export type DineOption = "eat_in" | "take_out";
export type StaffReason = "unknown_info" | "user_request" | "stuck" | "learned_mismatch";
export type ChangeKind = "add" | "update" | "remove" | "undo" | "clear";
export interface Session {
  sessionId: string; kioskId: string; demo: boolean; status: SessionStatus; dineOption: DineOption | null;
  cart: CartLine[]; total: number; cartVersion: number;
  screen: { category?: string; itemId?: string };
  lastChange: { lineId: string | null; kind: ChangeKind; source: Source; at: number } | null;
  pendingChoice: { templateId: TemplateId; choices: ChoiceRef[] } | null;
  staffCalled: { reasonCode: StaffReason; at: number } | null;
  undoStack: CartLine[][];          // last 5 carts, newest last
  recentCommandIds: string[];       // last 30
  checkoutUtteranceSeq: number | null; checkoutAt: number | null;
  upsellOffered: boolean; orderNumber: number | null; paidAt: number | null;
  phoneConnectedAt: number | null; phoneSeenAt: number | null;
  createdAt: number; lastSeenAt: number; expiresAt: number;   // epoch ms
}
export type Actor = "phone" | "kiosk";
```
All times are epoch milliseconds. `newSession({ sessionId, kioskId, demo, now }): Session` in `src/lib/commands/session.ts` returns status `idle`, empty cart, `expiresAt = now + SESSION_TTL_MS` (10 min).

### Command schemas: `src/lib/commands/schemas.ts` (zod)
Envelope: `{ sessionId: string(1–64), commandId: string(1–128), type, args, cartVersion?: int ≥ 0, utteranceSeq?: int ≥ 0, source: Source }`, strict (unknown keys rejected). `args` per `type` (a discriminated union; unknown type → `BAD_REQUEST`; strings ≤ 64 chars; ids `^[a-z0-9_]+$`):
| type | args |
|---|---|
| `startTouch`, `clearCart`, `undoLastChange`, `requestCheckout`, `cancelCheckout`, `confirmCheckout`, `editOrder`, `cardAction`, `reissueClaim` | `{}` |
| `setDineOption` | `{ option: "eat_in" \| "take_out" }` |
| `addToCart` | `{ itemId, variant?, qty?, selections? }` |
| `updateCart` | `{ lineId, changes: { qty?, variant?, selections? } }` (at least one change) |
| `removeFromCart` | `{ lineId }` |
| `offerChoices` | `{ templateId, choices: 1–6 × { kind, id } }` |
| `callStaff` | `{ reasonCode }` |
`selections`: record of ≤ 6 groups, each ≤ 6 option ids. Export `parseCommand(body: unknown): Command` that throws `CommandError("BAD_REQUEST", …)`.

### Actor table: `src/lib/commands/actors.ts`
Exactly ARCHITECTURE "Commands and actors": phone may send `setDineOption, addToCart, updateCart, removeFromCart, undoLastChange, offerChoices, callStaff, requestCheckout, cancelCheckout, confirmCheckout`; kiosk may send `startTouch, setDineOption, addToCart, updateCart, removeFromCart, clearCart, undoLastChange, callStaff, requestCheckout, cancelCheckout, confirmCheckout, editOrder, cardAction, reissueClaim`. Anything else → `FORBIDDEN`. (`bridgeReport` comes in a later phase; leave it out.)

### Machine: `src/lib/commands/machine.ts`
```ts
export interface CommandContext { actor: Actor; now: number; kiosk: KioskData; newLineId: () => string; newOrderNumber: () => number }
export interface CommandResult { upsell?: { offerItemIds: string[] }; lineId?: string }
export function applyCommand(s: Session, cmd: Command, ctx: CommandContext): { session: Session; result: CommandResult; duplicate: boolean }
```
Order (ARCHITECTURE processing order 3–7):
1. Actor check → `FORBIDDEN`.
2. `cmd.commandId` in `recentCommandIds` → return the session unchanged with `duplicate: true` (nothing applied, even if another command slipped in between).
3. Expired: `status === "expired"` or `now > expiresAt` → `GONE`. `paid` sessions accept nothing but `callStaff` (→ `CONFLICT`).
4. State rules (`CONFLICT` with a plain message when the state is wrong):
   - `startTouch`: `idle → ordering`; in `connected`/`ordering` a no-op that still counts as accepted.
   - `setDineOption`: `idle`(kiosk)/`connected` → `ordering`; in `ordering`/`confirming` just updates.
   - `addToCart`/`updateCart`/`removeFromCart`: allowed in `connected`, `ordering`, `confirming`; result status `ordering`. Use `cart.ts`.
   - `clearCart`: `ordering`/`confirming` → `ordering`, empty cart.
   - `undoLastChange`: not in `paying`/`paid`; pops `undoStack` (empty → `CONFLICT` "Nothing to undo"); in `confirming` → `ordering`.
   - `offerChoices`: any state before `paying`; validates each choice id against the catalog by kind (`item` → item exists; `variant` → one of the three; `option` → some group has it; `dine` → eat_in/take_out; `yesno` → yes/no); sets `pendingChoice`. Does not change the cart.
   - `callStaff`: any state except expired; sets `staffCalled`.
   - `requestCheckout`: `ordering → confirming`; empty cart → `CONFLICT`; `dineOption === null` → `NEEDS_CHOICE` `{ templateId: "pick_dine", choices: [dine eat_in, dine take_out] }`; records `checkoutUtteranceSeq = cmd.utteranceSeq ?? null`, `checkoutAt = now`.
   - `cancelCheckout`: `confirming → ordering`, cart unchanged.
   - `confirmCheckout`: only in `confirming`; `cmd.cartVersion !== s.cartVersion` → `CONFLICT`. Phone: `source === "button"` is enough; otherwise (voice/text) needs `cmd.utteranceSeq > s.checkoutUtteranceSeq` (a null checkout seq counts as -1) **and** `now - s.checkoutAt ≥ 1500`, else `CONFLICT` "Please confirm on the card." Kiosk: `source === "touch"`. → `paying`.
   - `editOrder`: `paying → confirming`.
   - `cardAction`: `paying → paid`; `orderNumber = ctx.newOrderNumber()`, `paidAt = now`.
   - `reissueClaim`: allowed before `paying`; the machine only validates state and records the command; the session service (next step) rotates the secrets.
5. Cart-changing commands (`addToCart`, `updateCart`, `removeFromCart`, `clearCart`, `undoLastChange`): push the old cart onto `undoStack` (keep last 5; not for undo itself), `cartVersion + 1`, recompute `total`, set `lastChange { lineId, kind, source: cmd.source, at: now }`, set `screen` to the changed item's `{ category, itemId }`.
6. Upsell: on an accepted `addToCart` when `!upsellOffered` and an `upsellRules` entry matches the added item (by `whenItemId` or `whenCategory`) and the item itself is not in `offerItemIds` → `upsellOffered = true`, `result.upsell = { offerItemIds }` filtered to items not sold out and available now (omit if empty).
7. Every accepted command: clear `pendingChoice` (except `offerChoices`, which sets it), append `commandId` to `recentCommandIds` (keep last 30), `lastSeenAt = now`, `expiresAt = now + SESSION_TTL_MS`.

### Tests (at least, from TESTING "Unit tests")
- duplicate `commandId` applies nothing, **including a retry after another command slipped in between**;
- full happy path touch: `startTouch → setDineOption → addToCart → requestCheckout → confirmCheckout(touch) → cardAction` ends `paid` with an order number;
- no payment without `confirming`; `confirmCheckout` with stale `cartVersion` → `CONFLICT`;
- `requestCheckout` and an AI `confirmCheckout` with the same `utteranceSeq` → `CONFLICT`; with a higher seq but 1.0 s later → `CONFLICT`; higher seq and 1.6 s → `paying`; `source: "button"` from the phone right away → `paying`;
- a phone token cannot send `cardAction`, `editOrder`, `startTouch` or `clearCart` (`FORBIDDEN`); a kiosk cannot send `offerChoices`;
- `paying → confirming` on `editOrder`; undo refused in `paying`; undo restores the previous cart and bumps `cartVersion`;
- cart change in `confirming` → `ordering`; `addToCart` in `connected` → `ordering` with `dineOption` null, then `requestCheckout` → `NEEDS_CHOICE` pick_dine;
- upsell: first burger add returns `upsell` with soft_cone and apple_pie; the second does not; adding a dessert first does not trigger it;
- expired session → `GONE`; `recentCommandIds` capped at 30, `undoStack` at 5; inputs never mutated.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. Run the AC commands.
2. Check the code against the ARCHITECTURE tables (states, actors, codes) line by line; if the docs and this step disagree, follow this step and log the mismatch in `docs/ISSUE.md` (class `contract-drift`).
3. Update this step in `phases/1-core/index.json` (completed + summary / error / blocked).

## Do not
- Do not let any path reach `paid` except the kiosk's `cardAction`, or `paying` except `confirmCheckout` in `confirming`: this is the product's main safety promise.
- Do not store free text in the session (no AI messages, no staff reasons as text), because anyone with the session id can read it.
- Do not read the clock, env or storage here; everything comes through `ctx`.
- Break existing tests.
