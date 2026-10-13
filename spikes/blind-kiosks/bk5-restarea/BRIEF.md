# bk5-restarea: 달빛고개 휴게소 푸드코트 (Dalbit Pass Rest Area Food Court)

A fictional highway rest-area food court kiosk: one machine takes orders for five counters.
Static app, no network, no build step, no randomness or clock use. Open `app/index.html` (designed for a 720x1280 portrait viewport).

## Files
- `app/index.html`, `app/style.css`, `app/app.js`, `app/data.js`: the kiosk (menu data lives in `data.js`).
- `answer-key.json`: catalog, option groups, flow, 10 holdout orders with expected totals, quirks.
- `selfcheck/run.mjs`: hand-written Playwright orders h1, h3, h4 plus a recomputation of all 10 key totals; output in `selfcheck/RESULT.txt`.
  Run from a folder whose `node_modules` has Playwright: `node <path>/selfcheck/run.mjs`.

## Flow
Attract (tap anywhere) -> 매장에서 먹기 / 포장하기 -> menu (tabs, tiles, cart panel) -> item detail sheet or 2-step set modal -> 주문 내역 review (봉투 for takeout) -> 주문 확인 modal -> 결제 수단 screen (stops there).

## Menu
31 products across 5 counters: 한식 7, 분식 7, 면류 7, 음료·간식 8, 세트 2. A 6th tab, 추천 (shown first), cross-lists 6 of those products.
Prices range 1,000원 to 12,000원.

## Patterns
- Counter tabs on top; 추천 repeats existing products (same id, merges in the cart), marked with a counter label in 추천 and a `BEST` ribbon in the home counter.
- Required single choice 맵기 (순한맛/보통/매운맛, no default) on 얼큰우동, 해물짬뽕, 비빔국수; optional 곱빼기 +1,000원 (checkbox) on those plus 가락우동, 잔치국수, 물냉면.
- Extra groups: 라면 toppings (multi, max 2, +500원 each); 아메리카노 온도 (required, HOT preselected, ICE +500원).
- Set meals 한상세트 (10,000원) and 면사랑세트 (8,000원): 2-step modal (식사/면 선택 -> 음료 선택) with 취소/다음 and 이전/장바구니 담기; meal and drink surcharges; drink preselected 콜라.
- `− 1 +` stepper on the detail sheet and on the last set step only; tiles have none; cart lines only have ✕.
- Sold out: 순대, 물냉면. Takeout only: 호두과자 선물상자 (refused with a modal in dine-in orders).
- Review screen groups lines by pickup counter and, for takeout, offers `봉투 +100원` (one per order, off by default).
- 주문 확인 confirmation modal, then the payment-method screen showing the final amount.
- Errors: inline 맵기/topping/set-step messages; modals for 품절, 포장 전용, empty cart, line quantity over 9; confirmations for 처음으로 and 전체삭제.

## Markup notes
Tabs, tiles, chips, set cards, the 주문하기 bar, the bag toggle and the 간편결제 tile are clickable `<div>`s; mode choice, steppers, HOT/ICE, modal actions and most payment tiles are `<button>`s; 곱빼기 is a native checkbox in a `<label>`.
Tile text runs together in the DOM (`면류얼큰우동6,500원`, `BEST얼큰우동`), set prices end with `~`, the cart writes `2개` while the review writes `x2`, and the cart total leaves out the bag while later screens include it.
