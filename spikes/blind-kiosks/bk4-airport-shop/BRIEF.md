# bk4-airport-shop — 하늘곳간 SKY PANTRY

A static self-order kiosk for a fictional airport convenience store / grab-and-go shop in Korea. The brand, items and wording are invented. Open `app/index.html` directly (no server, no network, no build step).

## What it is
- 37 items in 6 categories: 김밥·도시락 (7), 샌드위치·베이커리 (6), 음료 (7), 간식 (6), 여행용품 (6), 기념품 (5).
- Takeaway only, so there is no dine-in/takeout step.
- Flow: attract screen → menu → option sheet (for items with options) → cart drawer → 주문 내역 확인 (review) → 결제 수단 선택 (payment method). The flow stops at the payment method screen; choosing a method only shows a demo notice.

## Patterns
- **Korean/English toggle** on the attract screen (한국어 / English). The whole UI switches, item and option names included. The language can only be changed there. 처음으로 resets it to Korean.
- **Tile stepper**: simple items show `+ 담기`, which turns into `− n +` on the tile. Tapping the tile body also adds one.
- **Option sheet** (bottom popup) for 12 items: 데우기 여부 (lunchboxes, ham-cheese sandwich, chicken wrap), 소스 선택 (chicken wrap, hot dog, tenders; 갈릭마요 +300원), 온도/사이즈/샷 추가 (coffee; ICE +300원, 라지 +700원, shot +500원 each, max 2), 색상 (neck pillow), 선물 포장 (souvenirs, optional, +1,000원). A missing required option shows an inline red error.
- **Age check**: 활주로 라거 500ml asks "만 19세 이상입니까?" (예/아니요) when it is first added. 아니요 shows an error popup and nothing is added.
- **1+1**: 꿀바나나우유, 제주감귤주스, 버터감자칩. Each paid unit adds a free line "(1+1 증정)" at 0원 under the paid line.
- **Cart drawer**: the orange 🛒 장바구니 button (count badge) slides the cart in from the right. It has −/+, ✕, 전체 삭제 (confirm popup), 합계 and 주문하기.
- **Sold out**: 불고기김밥, 멀티 여행 어댑터 (greyed tile, 품절, toast on tap).
- **Time-limited**: 아침 한정 계란김밥 세트, 06:00–11:00.

## Fixed fake clock
The kiosk never reads the real time. The clock is the constant `fakeClock: '08:15'` in `app/js/data.js` and is shown in the menu header (현재 시각 08:15). At 08:15 the morning set is inside its 06:00–11:00 window, so it can be ordered. If the constant were set outside the window, tapping the item would show the error popup "지금은 판매 시간이 아닙니다."

## Popups and messages
- Option sheet; age confirmation; 전체 삭제 and 처음으로 confirmations.
- Error popups: under-19 answer, empty cart on 주문하기, more than 10 of one line, item outside its sale time.
- Inline error in the option sheet; toasts for sold out and "added to cart".

## Quirks
- The cart badge and 총 n개 include free 1+1 units.
- The age question is asked only when the beer goes from 0 to 1. After it is removed, adding it asks again.
- Option items with the same selections merge into one line. Different selections are separate lines.
- Prices read "4,500원" in English too.
- Text merges in the DOM: tile name and price, cart button and badge, cart line name and option summary.
- The category tab bar scrolls sideways. In English the last tab is partly off-screen at narrow widths.

## Files
- `app/` — `index.html`, `css/kiosk.css`, `js/data.js` (menu, option groups, fake clock), `js/i18n.js` (strings), `js/app.js` (behavior).
- `answer-key.json` — structure, prices, option groups, promotions, 10 holdout orders with expected totals (item names in Korean and English).
- `selfcheck/selfcheck.cjs` — places holdouts h3, h5 and h10 in the app (h10 in English) and prints the drawer, review and payment totals against the key. Run: `node selfcheck/selfcheck.cjs`. Screenshots go to `selfcheck/shots/`.
