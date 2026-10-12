# Step 1: cart-engine

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: ARCHITECTURE "`/api/command` processing order" (step 6–7), "sessions/{sessionId}" (`cart`, `total`), "Commands and actors"; PRD "Covering real kiosk complexity"; TESTING "Unit tests".
- `src/types/menu.ts`, `src/lib/adapters/catalog.ts`, `data/kiosks/malo.json` (step 0).

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Pure cart logic with no I/O. **Write the tests first** (`src/lib/commands/cart.test.ts`), see them fail, then implement.

### Types: `src/types/session.ts` (cart part; the next step adds the session document)
```ts
export type Source = "voice" | "text" | "button" | "touch";
export interface CartLine { lineId: string; itemId: string; variant: Variant; qty: number; selections: Record<string, string[]>; unitPrice: number }
export interface LineInput { itemId: string; variant?: Variant; qty?: number; selections?: Record<string, string[]> }
export interface LineChanges { qty?: number; variant?: Variant; selections?: Record<string, string[]> }
```

### Errors: `src/lib/commands/errors.ts`
```ts
export type ErrorCode = "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "GONE" | "NEEDS_CHOICE" | "SOLD_OUT" | "UNAVAILABLE" | "RATE_LIMITED" | "UPSTREAM";
export interface ChoiceRef { kind: "item" | "variant" | "option" | "dine" | "yesno"; id: string }
export interface ErrorDetail { templateId?: TemplateId; itemId?: string; groupId?: string; choices?: ChoiceRef[] }
export type TemplateId = "pick_item" | "pick_variant" | "pick_option" | "pick_dine" | "yes_no" | "alternatives" | "upsell";
export class CommandError extends Error { constructor(public code: ErrorCode, message: string, public detail?: ErrorDetail) }
export const HTTP_STATUS: Record<ErrorCode, number>   // table in ARCHITECTURE "Common rules"
```
`message` is plain English a user can read ("Please choose a drink."), never ids or stack traces.

### Cart functions: `src/lib/commands/cart.ts`
```ts
export const MAX_LINES = 20, MAX_QTY = 10;
export function resolveLine(k: KioskData, input: LineInput, now: number): { itemId; variant; qty; selections; unitPrice }   // validates, fills defaults, prices
export function unitPriceOf(k: KioskData, itemId: string, variant: Variant, selections: Record<string, string[]>): number
export function cartTotal(cart: CartLine[]): number
export function addLine(k, cart, input, now, newLineId: () => string): { cart: CartLine[]; lineId: string }
export function updateLine(k, cart, lineId, changes, now): CartLine[]
export function removeLine(cart, lineId): CartLine[]
export function sameLine(a, b): boolean   // same itemId, variant and selections (order-insensitive)
```
Rules (all errors are `CommandError`):
1. Unknown `itemId` → `BAD_REQUEST`. Item `soldOut` → `SOLD_OUT`, detail `{ templateId: "alternatives", choices: up to 2 { kind: "item" } in the same category that are not sold out and available now }`. Outside `availableHours` → `UNAVAILABLE` with alternatives the same way.
2. `variant` omitted: if the item has one variant use it; otherwise `NEEDS_CHOICE` with `{ templateId: "pick_variant", itemId, choices: [{kind:"variant", id}] }`. A variant the item does not have → `BAD_REQUEST`.
3. `qty` integer 1–10 (default 1), else `BAD_REQUEST`.
4. `selections`: every key must be a group that applies to the variant (else `BAD_REQUEST`); every option id must be in that group (else `BAD_REQUEST`, this blocks options from another item); count within `min..max` (else `BAD_REQUEST`); a sold-out option → `SOLD_OUT` with `{ templateId: "pick_option", itemId, groupId, choices: other available options }`. Groups that do not apply to the new variant are dropped.
5. Required group missing: use `defaultOptionIds` if any; otherwise `NEEDS_CHOICE` with `{ templateId: "pick_option", itemId, groupId, choices: [{kind:"option", id: optionId}] }` (the set drink, nugget sauce).
6. `unitPrice` = variant price + sum of selected options' `priceDelta`. Prices always come from menu data, never from input. `cartTotal` = Σ unitPrice × qty.
7. `addLine`: if an identical line exists (`sameLine`), add to its qty (still ≤ 10, else `BAD_REQUEST`) and return its `lineId`; otherwise append a new line with a fresh `lineId` from `newLineId()`. More than 20 lines → `BAD_REQUEST`. Same item with different options stays as separate lines.
8. `updateLine`: unknown `lineId` → `BAD_REQUEST`. `selections` in `changes` replace only the groups they name; other groups keep their values; then the whole line is re-validated and re-priced as in 1–6. Changing `variant` re-validates groups (set → single drops `side`/`drink`).
9. Never mutate inputs; return new arrays.

### Tests (at least)
- hero order: two `cheese_burger` sets, one with `ingredients: ["no_pickles"]` and `drink: ["zero_cola"]`, the other `drink: ["cider"]` → 2 lines, `side` defaulted to `fries_m`, each 6900, total 13800;
- "make both fries large": `updateLine` each with `{ selections: { side: ["fries_l"] } }` → 7400 each, total 14800, drink and ingredients unchanged;
- set without drink → `NEEDS_CHOICE` with 4 drink choices; nuggets without sauce → `NEEDS_CHOICE`;
- burger without variant → `NEEDS_CHOICE` `pick_variant` with 3 choices;
- shrimp burger → `SOLD_OUT` with 1–2 burger alternatives none sold out; a morning item at 14:00 KST → `UNAVAILABLE`;
- qty 0, 11, 1.5, -1 → `BAD_REQUEST`; 21st line → `BAD_REQUEST`; option from another item's group → `BAD_REQUEST`; four ingredients (max 3) → `BAD_REQUEST`;
- identical add merges qty; different selections → two lines;
- set → single drops side and drink and reprices; inputs are not mutated.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. Run the AC commands.
2. Check: no I/O in `cart.ts`; prices only from `KioskData`; error messages are plain words.
3. Update this step in `phases/1-core/index.json` (completed + summary / error / blocked).

## Do not
- Do not read Firestore, env or the clock inside these functions; `now` and `newLineId` are passed in, so tests are deterministic.
- Do not accept a price, total or name from input, because tool arguments come from the browser.
- Do not add session state, actors or idempotency here; the next step does that.
- Break existing tests.
