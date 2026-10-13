# bk3-ramen — 면구름 라멘 (Myeongureum Ramen) meal-ticket machine

A static, self-contained web app (`app/index.html`, `app/data.js`, `app/app.js`, `app/styles.css`) that behaves like a 식권 발매기 at a fictional Korean ramen shop. No network, no build step, no frameworks. Open `app/index.html` directly in a browser.

## Flow
1. Attract screen — tap anywhere.
2. Dine choice — 매장에서 먹어요 (매장) / 가져갈게요 (포장). Does not change prices.
3. Menu — one grid of 25 cards with filter chips (전체 / 라멘 / 덮밥 / 사이드 / 음료 / 세트). Cart list sits under the grid with −/+ per line, 전체 취소 and 주문하기.
4. Item popups — ramen, rice bowls and sets open a popup; sides and drinks are added with one tap.
5. 주문 확인 (order review) — lines, dine mode, 총 결제금액.
6. Payment method screen — card / mobile pay / mobile voucher. No payment happens.

## Menu (25 items, 5 categories)
- 라멘 (8): 돈코츠 9,500 · 매운 돈코츠 10,000 · 쇼유 9,000 · 시오 9,000 · 미소 9,500 · 탄탄멘 10,500 · 차슈 듬뿍 12,500 · 츠케멘 11,000 (**품절**)
- 덮밥 (4): 차슈 덮밥 8,500 · 규동 8,000 · 치킨 마요 덮밥 7,500 · 연어 덮밥 11,000
- 사이드 (6): 교자 4,500 · 가라아게 5,500 · 타코야키 5,000 (**품절**) · 미니 차슈덮밥 4,000 · 공기밥 1,000 · 에다마메 3,000
- 음료 (5): 콜라 2,000 · 사이다 2,000 · 제로 콜라 2,000 · 우롱차 2,500 · 유자 에이드 3,500
- 세트 (2): 라멘 기본 세트 13,500 · 라멘 든든 세트 15,000

## Patterns
- **Filter chips, not tabs**: one grid; 전체 shows every item in category order.
- **Required radio with no default**: 면 익힘 (꼬들/보통/부드럽게) on every ramen and in set step 1. Missing it → native `alert()`.
- **Per-topping quantity 0–3**: 차슈 +2,000 · 계란 +1,000 · 김 +500 · 숙주 +500 · 멘마 +1,000 · 콘버터 +1,500 (each unit). + at 3 → native `alert()`.
- **Radio with a default**: 밥 양 on rice bowls (보통 preselected, 곱빼기 +1,000).
- **3-step set popup**: 라멘(+면 익힘) → 사이드 → 음료, with 이전/다음 and an upcharge shown on each choice. The two sets have different side lists. No toppings in sets.
- **Cart editing in the list**: −/+ per line (− at 1 removes the line, max 9), 전체 취소 with an in-page confirmation popup.
- **Line merging**: the same item with the same options adds to the existing line; different options make a new line.
- **Sold out**: 2 greyed cards with a 품절 stamp; tapping shows a native `alert()`.
- **Errors via native `alert()`**: missing firmness, missing set choice, topping max, line max, sold out, empty-cart 주문하기, empty-cart 전체 취소.

## Quirks
- Markup mixes `<button>`s (chips, dine choice, cart −/+, popup footers) with clickable `<div>`s (menu cards, topping steppers, set choices, payment methods). Radios are real `<input type="radio">` hidden inside styled labels.
- Card text merges in the DOM, e.g. `🍜돈코츠 라멘진한 돼지뼈 육수9,500원`.
- A short toast ("… 담았습니다") appears after adding; it is cosmetic and never blocks input.
- 처음으로 clears the cart (asks first when the cart is not empty).
- Nothing is random and nothing depends on the clock.

## Files
- `answer-key.json` — full menu, option groups, 10 holdout orders with expected totals, quirks. Quantity groups list an option id once per unit.
- `selfcheck/run.mjs` — places holdouts h3, h6, h8 through the UI and compares the payment-screen total with the key.
- `selfcheck/verify-key.mjs` — recomputes all 10 expected totals from the key's own prices.

Run: `node selfcheck/verify-key.mjs && node selfcheck/run.mjs`
