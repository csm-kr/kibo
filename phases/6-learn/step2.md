# Step 2: bridge-client

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: KIBO_LEARN "How it finds things to tap", "Runtime"; ARCHITECTURE "Sequence diagrams" 3; SECURITY "Learned kiosks" (check variables against the catalog before any click, forbidden labels, one command at a time, check the current screen first, verify total and lines).
- `spikes/kibo-learn/driver.mjs` (`MARK_CLICKABLES`, `locate`, `act`, `runSteps`: port these ideas, do not import the spike).
- Code: `skills/doughhouse.json`, `src/lib/adapters/learned.ts`, `src/lib/commands/*` (bridgeReport), `src/hooks/useSessionStream.ts`, `src/hooks/useKioskSession.ts`, `src/lib/client/api.ts`, `src/components/kiosk/*` (QR rendering), `public/learned-kiosks/doughhouse/index.html`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
The bridge that operates a learned kiosk page without changing it, and the page that hosts it. Pure parts get **tests first**.

### `src/lib/bridge/` (browser code, no Node APIs)
- `labels.ts`: `markClickables(doc: Document): string[]` and `findByLabel(doc, label): Element[]`: the driver's rules (visible; `cursor: pointer`, an `onclick`, or a native control; outermost clickable only; label = most prominent text with letters that is not a price, falling back to `aria-label`, `title`, value, first line). Use the iframe's own `getComputedStyle` (`doc.defaultView`).
- `recipe.ts`: `planSteps(steps, vars) → PlainStep[]` (expands `forEach`, `repeat`, `{placeholders}`; **pure, unit-tested**), and `runPlan(doc, plan, opts)`: for each step locate by label (exactly one match, else fail; `clickNth` picks the n-th match), by role+name (`input[type=radio|checkbox]` whose label text contains the name), or by text; refuse any target whose label matches `forbiddenLabels` (fail, never click); `clickIfVisible` skips when absent; after each click wait until the DOM settles (two animation frames + up to 300 ms of no mutations) with a 3 s timeout per step.
- `verify.ts`: `readKioskTotal(doc, pattern) → number | null`, `readKioskLines(doc, linePattern) → string[]` (**unit-tested** on sample text).
- `bridge.ts`: `createBridge({ doc, kiosk, sessionId, kioskToken, send })` with `handle(pending)`: (1) check the current screen: if the home/start screen is showing (the `startOrder` first label is visible), run `startOrder` with the session's dine option label (or eat-in); (2) build vars from the catalog **by id** (category label, item label, option labels, `qtyMinus1`, `lineIndex`), refusing anything not in the catalog before any click; (3) run the recipe (`setDineOption` → `startOrder`; `addToCart` → `addToCart`; `removeFromCart` → `removeLine`); (4) read total and lines; (5) `send` `bridgeReport { commandId, ok, kioskTotal, kioskLines }` with the kiosk token. On any failure: close open dialogs if a close/cancel label is visible, read the cart, report `ok: false`. Never retry. One command at a time (a simple queue keyed by commandId; ignore a pending command already handled).

### Host page: `src/app/learned/[kioskId]/page.tsx` + `src/components/learned/LearnedKioskHost.tsx`
- Renders the learned kiosk page in a same-origin `<iframe src={kiosk.learned.page}>` at a fixed portrait canvas (1080×1600 like the learner's viewport, scaled to fit, letterboxed) and the bridge in the parent, operating `iframe.contentDocument`.
- Session: like `/kiosk` (create or resume with the kiosk token in localStorage per kiosk id; `/demo` will pass its own session and tokens as props instead).
- A small **KIBO widget** overlaid in a corner, outside the kiosk's own UI: the QR ("Order by talking", Korean + English), phone-connected state, and a status line while the bridge works ("KIBO is entering your order…", then "Added: …" or "Please check the screen"). The widget is KIBO's (KIBO blue allowed); text ≥ 32px at the scaled size is not required here, but it must pass the phone-like rules (≥ 16px rendered, ≥ 44px targets) at the 1440×900 demo size.
- Subscribes to the session stream; when `pendingBridgeCommand` changes, calls `bridge.handle`.
- Unknown kiosk id or a direct kiosk → "Kiosk not found".

### E2E: `e2e/learned.spec.ts` (memory store, no model)
Open `/learned/doughhouse`, read the claim URL from the widget's QR `data-claim-url`, claim it, send `setDineOption` then `addToCart` "large pepperoni, thin dough, bacon and olive" and a cola 1.25L with the device token: the iframe's own cart shows both lines and the total 25,500원… (compute the real expected value from the skill), and the session cart mirrors it with `bridgeStatus.lastOk`. Then `removeFromCart` of the cola → the kiosk's own cart drops it. Then a forced mismatch (edit the iframe cart through the page before a report, or send an add whose replay you break by hiding a tile) → `staffCalled: learned_mismatch`. Measure replay time per command and save `evidence/bridge-replay.json` (automated run, laptop; R-001).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
```

## Verify
1. Run the AC commands.
2. Check: the kiosk page file is untouched; no click on any forbidden label is possible (unit test for the guard); variables are checked against the catalog before clicks.
3. Update this step in `phases/6-learn/index.json` (completed + summary / error / blocked).

## Do not
- Do not inject scripts into or modify the learned kiosk page.
- Do not use AI at runtime for the replay (ADR-007).
- Do not retry a failed replay.
- Break existing tests.
