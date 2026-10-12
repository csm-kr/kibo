# Step 2: kiosk-menu

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: UI_GUIDE "Kiosk flow to follow", "Components" (product tile, bottom sheet, AI change); UX "Flow A" A6–A7, "Flow B", "Exception flows" (sold out), "Screen map" K3, K4, K5, KX; UI_QA "KIBO numbers"; ARCHITECTURE "Commands and actors", `upsellOffered`, `lastChange`, `screen`.
- Files from step 1: `src/components/kiosk/KioskCanvas.tsx`, `src/components/kiosk/KioskScreen.tsx`, `src/lib/kiosk/screen.ts`, `src/lib/i18n/kiosk.ts`, `src/lib/client/api.ts`, `src/hooks/*`, `src/app/kiosk/page.tsx`. Phase 1: `src/lib/commands/cart.ts` (`unitPriceOf`, `resolveLine` rules), `src/lib/adapters/catalog.ts`, `data/kiosks/malo.json`.
- Reference look: `design/prototype/Main.dc.html` menu, sheet and upsell sections (pixel values are not the spec).

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
K3 menu, K4 product sheet, K5 upsell, and the AI-change highlight. Pure helpers get tests first.

### Pure helpers: `src/lib/kiosk/` (tests first)
- `lineLabel(kiosk, line, locale) → { title, detail }`: title like "치즈버거 세트" (variant words from i18n: 단품 / 세트 / 라지 세트), detail listing chosen option names in group order ("감자튀김 M · 제로콜라 · 피클 빼기"), names only from menu data.
- `sheetSteps(item) → Step[]`: the K4 steps for an item: `variant` (only if it has several variants), then one step per option group that applies to the chosen variant (side, drink, then ingredients; ingredients step also holds quantity). Each step has `{ kind, groupId?, label, index, count }` for "2/4 단계 · 사이드".
- `sheetPrice(kiosk, draft)` reuses `unitPriceOf` from `src/lib/commands/cart.ts` (it has no I/O, so it is safe on the client) × qty.
- `formatWon(n)` → "4,900원".

### K3 menu (`src/components/kiosk/MenuScreen.tsx` and small parts)
- Top bar: brand, dine option chip ("매장" / "포장"), phone status ("휴대폰 연결됨" or a **small QR** button that opens the QR large; Flow B: switching to voice keeps the cart). When a phone is connected show "다른 휴대폰 연결" that sends `reissueClaim` and updates the QR from the returned `claimUrl`.
- Left category rail (icons + names from data), a 2-column photo grid of product tiles: photo 272px high, name 40px bold, price 40px in `--k-primary`, kcal 40px secondary, badge top-left (BEST mustard, NEW teal; text, not color alone), sold-out overlay with "품절" text (tile not tappable), out-of-hours overlay "지금은 판매하지 않아요" (`isAvailableNow`). Grid scrolls vertically inside the canvas.
- Bottom cart bar: line count and total, a preview of lines (chips), "전체 삭제" (`clearCart`, with a confirm), "주문하기" (`requestCheckout`) in the accent color. Primary action bottom right (UX heuristic 4).
- **AI change**: when `session.lastChange` changes and its `source` is `voice` or `text`: switch to `session.screen.category` unless a sheet is open or the user touched the kiosk in the last 5 s; give the matching tile and cart chip a 6–8px `--k-primary` ring for 2 s (fade), and show a status line "AI가 담았어요: 치즈버거 세트" (kind add; "바꿨어요" update, "뺐어요" remove, "되돌렸어요" undo, "비웠어요" clear) with an `aria-live="polite"` region. Touch changes get the ring without the AI wording.

### K4 product sheet (`ProductSheet.tsx`)
Bottom sheet (48px top radius) over the menu: photo, name, steps from `sheetSteps` with a step label showing steps left, options as a 3-column photo grid (selected = 6px `--k-primary` border + tint ring + a check mark, never color alone), defaults preselected (`defaultOptionIds`), a required group without a default keeps "다음" disabled until chosen, quantity stepper (− / + with labels) on the last step, live price, "담기" in the accent color, "닫기". Groups with `max > 1` (ingredients) allow multiple picks up to `max`. Sold-out options are shown disabled with "품절".
- On "담기": **optimistic update**: show the line in the cart bar immediately (pending style), send `addToCart` (`source: "touch"`), then the stream confirms it; on error roll back and show the plain message from the response.

### K5 upsell (`UpsellPopup.tsx`)
When a **touch** `addToCart` response has `result.upsell`, show one pop-up "디저트도 함께 드릴까요?" with the offered items as photo buttons ("추가" adds `single` via `addToCart`) and "괜찮아요". The server marks the offer as made, so it appears once per order. Changes from the phone never open it on the kiosk (the phone asks).

### Wire into `KioskScreen`
`menu` screen → `MenuScreen`; keep step 1's placeholders for review/payment/done.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```
Then a smoke test with `npm run dev` (memory store): fetch `/kiosk`, create a session and send a touch `addToCart` via the API with the kiosk token, confirm 200 responses; stop the server.

## Verify
1. Run the AC commands and the smoke test.
2. Check against UI_QA "KIBO numbers": tile sizes, ≥ 40px text, ring width, step label, selection not by color alone, targets ≥ 64px for primary actions with ≥ 8px gaps.
3. Update this step in `phases/2-kiosk/index.json` (completed + summary / error / blocked).

## Do not
- Do not compute the total on the client for anything but the optimistic preview; the server's `total` is the truth.
- Do not show the upsell more than once per order or for phone-originated changes.
- Do not move the screen under a user who is mid-selection (sheet open or touch within 5 s).
- Do not add names, prices or promotions that are not in `data/kiosks/malo.json`.
- Break existing tests.
