# bk10-chicken — 달빛닭장 (Moonlight Coop Chicken) self-order kiosk

A fictional Korean fried-chicken shop kiosk for eat-in and pickup. Static web app, portrait 720×1280, no network, no build step. Open `app/index.html` with a `file://` URL.

## Files
- `app/index.html`, `app/app.js`, `app/style.css`: the kiosk. Pictures are emoji on CSS shapes; no images, fonts or external assets.
- `answer-key.json`: catalog, option groups, rules, 10 holdout orders with the expected total shown on the payment screen.
- `selfcheck/place-orders.mjs`: places all 10 holdout orders in the UI using Playwright, compares cart / review / payment totals with the key, recomputes each total from the key's own price data, and runs 15 UI rule checks (catalog, option labels and prices, error and confirmation messages). Writes `selfcheck/RESULT.txt`.
- `selfcheck/screens.mjs`: captures one screenshot per screen into `selfcheck/shots/`.

Run: `node selfcheck/place-orders.mjs` (imports Playwright by absolute path from the kibo repo's `node_modules`).

## Flow
1. Attract screen (tap anywhere).
2. Dine choice: `매장 식사` or `포장 주문`.
3. `포장 주문` only: pickup time from fixed slots `20분 후` / `30분 후` / `40분 후` / `1시간 후`, then `확인`. No price change. The choice shows in the menu header and on the review screen.
4. Menu: 6 category tabs, 3-column grid, cart list at the bottom (−/+ stepper, line price, ✕ delete, `전체삭제`, total, `주문하기`).
5. Option popup for items with options; items without options go straight into the cart.
6. Order review with `총 결제 금액`, then `결제하기`.
7. Payment-method screen with `결제하실 금액`. Tapping a method opens a waiting popup with only `결제 취소`. Nothing is ever charged.

## Menu (30 items, 6 categories)
| Category | Items |
|---|---|
| 치킨 (7) | 바삭 후라이드 18,000원 · 달빛 양념치킨 19,000원 · 간장마늘치킨 20,000원 · 매운불꽃치킨 20,000원 · 허니버터치킨 20,000원 · 치즈시즈닝치킨 21,000원 · 파닭치킨 21,000원 (품절) |
| 반반 (3) | 반반치킨 19,000원 · 반반치즈볼 22,000원 · 반반똥집 23,000원 |
| 사이드 (6) | 감자튀김 3,500원 · 치즈볼 4,000원 · 똥집튀김 7,000원 · 콘샐러드 2,000원 · 떡볶이 5,500원 · 치킨무 추가 500원 |
| 소스 (5) | 양념소스 · 허니머스타드 · 갈릭마요 · 매운디핑소스 (각 500원) · 치즈디핑소스 800원 |
| 음료/주류 (6) | 콜라 500ml · 제로콜라 500ml · 사이다 500ml (각 2,000원) · 콜라 1.25L 3,000원 · 생맥주 500cc 4,500원 (주류) · 달빛 하이볼 6,000원 (주류) |
| 세트 (3) | 혼닭세트 14,500원 · 치킨 한상세트 23,000원 · 반반 한상세트 25,000원 |

## Patterns
- **Dine choice at the start**, with a pickup-time step for `포장 주문` (fixed slots, no price change).
- **Chicken options**: `사이즈 선택` (required, 한 마리 preselected, 반 마리 −7,000원) and `뼈/순살 선택` (required, no default, 순살 +2,000원).
- **반반**: `반반 맛 선택` needs exactly 2 different flavors. 간장마늘 / 매운불꽃 / 허니버터 cost +1,000원 and 치즈시즈닝 +2,000원. 파닭 is greyed out as 품절. Also used by 반반 한상세트.
- **Sauces**: `소스 추가` is an optional multi-select (max 3) on 치킨 and 반반 items. The rule appears on screen ("첫 번째 소스 무료 · 두 번째부터 1개당 +500원 (최대 3개)") and in live 무료/+500원 labels. Sauce cups are also sold on their own in the 소스 category.
- **Sold out**: 파닭치킨 card (stamp + toast), and the 파닭 flavor in the 반반 list.
- **주류 age check**: 생맥주 500cc and 달빛 하이볼 ask "만 19세 이상이십니까?" every time they are tapped. `아니요` blocks the item.
- **Set upsell**: after 치킨 한상세트 or 반반 한상세트 is added, the popup "콜라 1.25L로 변경하시겠어요? +1,000원" asks `아니요` / `변경할게요`. 혼닭세트 has no upsell. Sets have `치킨 맛 선택` (간장마늘 +1,000원) or the 반반 flavor pair, plus `뼈/순살 선택`.
- **Cart**: quantity edit with −/+, delete with a confirmation, `전체삭제` with a confirmation, and identical lines merged.
- **Errors**: missing required option, too many flavors or sauces, sold-out tap, no pickup slot, `주문하기` with an empty cart, under-19 refusal.

## Quirks
- Item cards hold name and price in one element (DOM text `바삭 후라이드18,000원`). The payment amount is split into separate elements.
- Real `<button>`s for dialogs, steppers and main actions. Clickable `<div>`s for category tabs, item cards, option rows, pickup slots, payment methods, ✕ delete and `전체삭제`. `매장 식사` is a `<button>`; `포장 주문` is a `<div>`.
- `−` in the cart is disabled at 1. Removal goes only through ✕ and its confirmation.
- `처음으로` asks for confirmation when the cart has items.
- Toasts fade after about 1.8 s (cosmetic). There are no clocks, timers that change behavior, idle resets or randomness.
- All names, the brand and the copy are invented. No real brands, products or logos.

## Self-check
See `selfcheck/RESULT.txt`: 10/10 holdout orders match the key on the payment screen, and 15/15 UI rule checks pass.
