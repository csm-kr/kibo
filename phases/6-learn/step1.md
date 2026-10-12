# Step 1: bridge-server

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: ARCHITECTURE "Commands and actors" (Learned kiosks paragraph, `bridgeReport`, `cardAction` refused for learned kiosks), "Sequence diagrams" 3, `pendingBridgeCommand`, `staffCalled` (`learned_mismatch`); SECURITY "Learned kiosks"; UX "Exception flows" (learned kiosk replay fails).
- Code: `src/lib/commands/{machine,schemas,actors,cart,errors}.ts` (+ tests), `src/lib/session/service.ts`, `src/types/session.ts`, `src/lib/adapters/learned.ts`, `skills/doughhouse.json`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Server rules for learned kiosks: the kiosk page is the source of truth, so cart commands wait for the bridge to replay them and report what the kiosk shows. **Tests first.**

### Session fields (`src/types/session.ts`)
- `pendingBridgeCommand: { commandId; type: "setDineOption" | "addToCart" | "removeFromCart"; args; lineIndex?: number; source; at } | null` (null for direct kiosks; `newSession` sets null).
- `bridgeStatus: { lastOk: boolean; at: number } | null` (for the phone's "Please check the kiosk screen").

### Machine (`applyCommand` with `ctx.kiosk.kind === "learned"`)
- `setDineOption`, `addToCart`, `removeFromCart`: validate exactly as for direct kiosks (catalog, options, sold out), then **do not change the cart**; set `pendingBridgeCommand` (for remove, also `lineIndex` = the line's position, which the bridge needs) and return `result: { pending: true }`. A second command while one is pending → `CONFLICT` "The kiosk is still working on your last request." A pending command older than 20 s counts as failed: clear it, set `staffCalled: learned_mismatch`, `bridgeStatus.lastOk = false`, then process the new command.
- `updateCart` → `CONFLICT` with a plain message ("On this kiosk, please remove the item and add it again."), so the AI does remove + add (ARCHITECTURE). `undoLastChange` → only when the last change was an add: becomes a pending `removeFromCart` of that line; otherwise `CONFLICT`.
- `requestCheckout`: as usual (`confirming`); `confirmCheckout`, `editOrder`, `cardAction`, `clearCart` → `CONFLICT` "Please finish and pay on the kiosk screen." (learned sessions end at `confirming`; the user pays on the kiosk).
- New command `bridgeReport` (kiosk actor only; add to schemas and actors): args `{ commandId: string; ok: boolean; kioskTotal: int ≥ 0 | null; kioskLines: ≤ 20 × string ≤ 120 chars }`. Rules: `commandId` must equal the pending one (else `CONFLICT`). Compute the expected cart by applying the pending change with `cart.ts` to the current cart, and its total. If `ok` and `kioskTotal === expectedTotal` → apply the change (cart, `cartVersion + 1`, `undoStack`, `lastChange` with the **original command's source**, `screen`), clear pending, `bridgeStatus { lastOk: true }`. Otherwise → do not apply, clear pending, `staffCalled: learned_mismatch`, `bridgeStatus { lastOk: false }` (the phone shows "Please check the kiosk screen" and offers staff). `kioskLines` are used only for that comparison; never store them (free text from a third-party page).
- `bridgeReport` and the bridge's `startTouch`/`ping` use the kiosk token (the bridge is the kiosk actor, SECURITY).

### Service and API
- `runCommand` passes `kiosk.kind` through; the response for a pending command is `{ ok: true, pending: true, status, cart, total, cartVersion }`.
- `/api/chat` and the tool results: a pending result tells the model "The kiosk is doing it now; say you are adding it and wait." (`toolResult` gets `pending: true`).
- `toolDeclarations(kiosk)` for learned kiosks omits `updateCart` and `confirmCheckout`; `buildInstructions` adds: "This kiosk is operated by replaying its own screens. Changes take a few seconds. To change an item, remove it and add it again. The user pays on the kiosk itself after the confirm card."

### Tests
- add on doughhouse → pending, cart unchanged; a matching `bridgeReport` → cart has the line, `lastChange.source` = the original source; a wrong total → no change, `staffCalled` learned_mismatch;
- a second add while pending → 409; a stale pending (21 s) is cleared on the next command with a mismatch flag;
- `bridgeReport` from the phone token → 403; with another commandId → 409;
- `confirmCheckout`/`cardAction` on doughhouse → 409; `updateCart` → 409 with the plain message;
- MALO behaviour unchanged (all old tests pass);
- learned tool declarations have 7 tools.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. Run the AC commands.
2. Check: no path from a learned session to `paying`/`paid`; no free text from the kiosk page stored in the session.
3. Update this step in `phases/6-learn/index.json` (completed + summary / error / blocked).

## Do not
- Do not retry a failed replay automatically (double-add risk; SECURITY "No runtime self-healing").
- Do not change MALO's rules.
- Break existing tests.
