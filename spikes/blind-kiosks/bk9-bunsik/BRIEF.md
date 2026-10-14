# bk9-bunsik: 보리별 분식 (Boribyeol Bunsik)

A fictional Korean snack-bar (분식집) self-order kiosk. Static web app, portrait 720×1280, Korean UI only. It needs no network, build step, external fonts or framework. Open `app/index.html` over `file://`.

## Files
- `app/index.html`, `app/style.css`: the page shell and styles.
- `app/menu.js`: the store's menu data, loaded as a classic script. It holds categories, option groups, items and the fixed clock.
- `app/app.js`: kiosk logic and rendering. It uses one click handler with `data-act` attributes, on a mix of `<button>`s and clickable `<div>`/`<span>`s.
- `answer-key.json`: the catalog, rules and 10 holdout orders with expected totals.
- `selfcheck/run-holdouts.js`: checks the catalog and places all 10 holdout orders. It writes `selfcheck/RESULT.txt`.
- `selfcheck/shots.js`: captures one screenshot per screen into `selfcheck/shots/`. These are for a visual check only.

## Screen flow
1. **Attract screen**: brand, 오늘의 할인 card, and "화면을 터치하여 주문을 시작하세요". Tapping anywhere starts an order.
2. **Dine choice**: "매장에서 먹어요" or "포장해 갈게요". Both cost the same, and the screen says "매장 식사와 포장 가격은 같아요".
3. **Menu**: from top to bottom:
   - header with the 매장 식사/포장 주문 chip, the fixed clock and 처음으로
   - 오늘의 할인 banner
   - six category tabs
   - a three-column card grid
   - a bottom cart panel with −/+ steppers, ✕ delete, 전체 삭제, the total and 주문 확인하기
4. **Option popup**: one per item. It shows required (필수) and optional (선택) groups, a quantity stepper (max 9) and an "N원 담기" button. 보리별 세트 opens a 3-step popup instead (1 떡볶이 › 2 김밥 › 3 음료) with 이전/다음 buttons and "세트 담기 N원" at the end.
5. **Order review (주문 내역 확인)**: dine method, the numbered lines, then 주문 금액, 할인 금액 and **총 결제 금액**. Buttons: 이전으로 and 주문하기.
6. **Points popup**: "포인트 적립하시겠어요?" with "적립 안 할게요" and "적립할게요". 적립할게요 opens a keypad for the 8 digits after 010.
7. **Payment method (결제 수단 선택)**: shows 결제하실 금액 and three methods: 신용/체크카드, 간편결제 and 모바일 상품권. Picking one only shows an instruction and a demo notice. Nothing is charged, and the flow ends here.

## Menu: 32 items in 6 categories
| Category | Items |
|---|---|
| 떡볶이 (6) | 보리별 4,500 · 치즈 5,500 · 로제 6,500 (오늘의 할인 5,500) · 짜장 5,500 · 궁중 6,000 (no spice group) · 점심 쫄볶이 5,000 (점심 한정 11:00~14:00) |
| 김밥 (6) | 보리별 3,500 · 김치 4,000 · 참치 4,500 · 치즈 4,500 · 돈까스 5,000 · 멸치 4,500 (품절) |
| 라면/우동 (6) | 보리별 라면 4,000 (면 익힘 required) · 해물 5,500 · 만두 5,000 · 짬뽕 5,500 · 어묵 우동 5,500 · 김치 우동 6,000 |
| 튀김/순대 (6) | 모둠 튀김 5,000 · 김말이 2,500 · 고추 3,000 · 오징어 3,500 · 찹쌀 순대 4,500 (순대 구성 required) · 군만두 3,500 |
| 세트 (3) | 보리별 세트 9,900 (step popup) · 떡튀순 세트 12,000 (맵기 only) · 튀순 세트 8,500 |
| 음료 (5) | 콜라 2,000 · 사이다 2,000 · 오렌지 주스 2,500 · 식혜 2,500 · 생수 1,000 |

## Patterns covered
- Eat-in or take-out choice at the start, with no price difference.
- 떡볶이 options:
  - 맵기 선택 is required and single choice: 1단계 순한맛 to 5단계 아주매운맛. There are 5 levels, no price change and no default.
  - 토핑 추가 is optional and multi choice, max 3, and each topping is priced: 삶은 계란 +500, 어묵 추가/당면 사리/만두 사리 +1,000, 라면 사리/모짜렐라 치즈/비엔나 소시지 +1,500.
- 김밥 options:
  - 김밥 커팅 is required: 썰어서 or 통으로.
  - "김밥 추가 1줄" is an optional quantity stepper, +3,000원 per roll, max 3.
- Ramen options:
  - 추가 재료 is optional on every 라면: 계란 +500, 치즈 +700, 떡 사리 +1,000.
  - 면 익힘 정도 (꼬들하게, 보통, 푹 익혀서) is required on 보리별 라면 only.
- Set menu (보리별 세트, 9,900원) built in a step-by-step popup:
  1. 떡볶이 (보리별 +0, 치즈 +1,000, 로제 +1,500) and 맵기
  2. 김밥 (보리별 +0, 김치 +0, 참치 +500, 돈까스 +1,000) and 커팅
  3. 음료 (콜라 +0, 사이다 +0, 오렌지 주스 +500, 식혜 +500)
- 오늘의 할인 banner: 로제 떡볶이 drops from 6,500원 to 5,500원. Tapping the banner opens that item.
- One time-limited item: 점심 쫄볶이, sold 11:00~14:00 only, checked against the fixed fake clock below.
- The points popup appears after 주문하기 on the review screen, before the payment-method screen.
- Cart:
  - Quantity edit with −/+ (− is disabled at 1, max 9).
  - ✕ delete asks "선택한 메뉴를 삭제할까요?" with 취소/삭제.
  - 전체 삭제 asks "장바구니를 모두 비울까요?".
- Review screen shows 총 결제 금액, and the payment-method screen is where the flow stops.
- Prices are always written as "4,500원".
- Popups, confirmations and errors:
  - Popups: the points popup, the phone keypad, and the empty-cart notice ("장바구니가 비어 있어요").
  - Confirmations: delete, clear, and 처음으로/주문 취소.
  - Errors: a missing required option ("필수 옵션을 선택해 주세요. (맵기 선택)"), more than 3 toppings, more than 3 extra rolls, and a short phone number. Tapping a sold-out item shows a toast.

## Fixed fake clock
The kiosk never reads the device clock. The store time is hard-coded in `app/menu.js` as `clock: { label: '10.14 (수) 12:30', minutes: 750 }`, and every header shows **10.14 (수) 12:30**. 점심 쫄볶이 is on sale when 11:00 ≤ clock < 14:00, so it is always available in this build. If the clock fell outside that window, the card would show "판매 시간 아님" and could not be added.

## Price rules
- Unit price = item price (or the promo price for 로제 떡볶이) + the selected option deltas + 3,000 × the number of extra rolls.
- Line total = unit price × qty. Order total = the sum of line totals.
- The discount is only on standalone 로제 떡볶이. Choosing 로제 inside 보리별 세트 costs the +1,500 upgrade with no discount.
- On the review screen, 주문 금액 is at list price, 할인 금액 is shown as a negative amount, and 총 결제 금액 is the amount actually charged. The payment screen shows the same number as 결제하실 금액.
- Points (1%, shown as "적립 예정 NP") and the eat-in/take-out choice never change the amount.

## Quirks
- The 로제 떡볶이 card shows the struck-through list price and the sale price in one element, so its DOM text reads "6,500원5,500원". Option chips likewise merge their label and price ("삶은 계란+500원"), and the dine cards merge their label and subtitle.
- Required groups have no default.
- 보리별 세트's popup has no quantity stepper, so set quantity changes only in the cart.
- Adding an item with exactly the same options as an existing cart line merges the two (quantities add up).
- The menu header shows "매장 식사"/"포장 주문", not the dine button label.
- A toast ("장바구니에 담았어요.") shows briefly after each add and hides after 1.8 s. It never blocks taps and does not change behaviour.
- In `answer-key.json`, a holdout line lists the quantity option (`gimbap_extra`) once per unit, for example `["extra_roll","extra_roll"]` for 2 rolls. Each holdout has a `dine` field with the exact button label.

## Self-check
`node selfcheck/run-holdouts.js` drives headless Chromium through Playwright (imported by absolute path from the host repo's `node_modules`). It does three things:
- **Catalog check:** it compares every category tab, card name, price and sold-out flag, and every option group's title, required flag, option labels and price deltas, with the answer key.
- **Holdout orders:** it places all 10 orders by clicking visible labels. Along the way it exercises the required-option error, the 4th-topping error, line merge, cart +, delete with 취소 then 삭제, 전체 삭제, the points popup (accept with a short-number error, accept, decline) and the payment stop.
- **Total checks:** for each order it checks the add-button price, each cart line, the review 총 결제 금액 and the payment 결제하실 금액 against `expectedTotal`.

The result is in `selfcheck/RESULT.txt`.
