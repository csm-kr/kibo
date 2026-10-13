# bk6-themepark: 별바다 파크 (Starsea Park) ticket and snack kiosk

A fictional Korean self-service kiosk for a theme park and aquarium. It sells admission tickets, ride passes, snacks, drinks and souvenirs. It is a static app with no network, no build step, no fonts or CDNs, and no randomness or timers. Open `app/index.html` in a browser. The layout is a 720×1280 portrait kiosk.

## Files
- `app/index.html`, `app/style.css`, `app/app.js`, `app/data.js`: the kiosk. `data.js` holds the menu data and `app.js` holds the screens and logic.
- `answer-key.json`: the menu, option groups, promotion, 10 holdout orders with expected totals, and quirks.
- `selfcheck/`: Playwright scripts and `RESULT.txt`.

## Screens
1. **Attract screen**: brand, "화면을 터치하여 주문을 시작하세요", and a **한국어 / English** toggle. Tap anywhere else to start.
2. **Menu**: 처음으로 button, a 2+1 banner, 5 category tabs (`<li>`), a card grid (clickable `<div>`s), and a bottom bar with 장바구니 (count), 합계 and 주문하기.
3. **Option sheet** (bottom sheet):
   - Tickets: 할인 유형 (일반 / 장애인 우대 / 경로 우대) on 4 of the 7 tickets, then 대인/청소년/소인 "− 0 +" steppers.
   - Snacks: 추가 선택, multi-select, max 2, +500원 or +1,000원, plus 수량.
   - Drinks: 사이즈 R/L (L +1,000원) plus 수량. 생수 has 수량 only.
   - Souvenirs have no sheet. One tap adds one to the cart.
4. **Membership popup** "회원이신가요?": appears after the first add and blocks the screen until it is dismissed.
5. **Cart drawer**: slides in from the right. Each line has − / +, 삭제 (with a confirmation), and there is a 전체 삭제 button. Ticket lines and the free line have no quantity controls.
6. **Order review** "주문 내역을 확인해 주세요": shows 총 결제 금액.
7. **Payment method**: 신용/체크카드, 간편결제, 모바일 상품권. Picking one asks for confirmation, then shows a practice-kiosk notice. Nothing is charged.

## Menu (25 items, 5 categories)
- 입장권 (4): 아쿠아리움 입장권*, 오션 스카이 전망대, 아쿠아리움+전망대 패키지*, 4D 해저탐험 영상관
- 자유이용권 (3): 종일 자유이용권*, 오후 자유이용권*, 빅5 어트랙션 이용권
- 간식 (6): 별사탕 츄러스 (2+1), 고래 꼬리 핫도그 (품절), 소금빵 크로플, 산호 팝콘, 해마 와플, 통감자 버터구이
- 음료 (6): 블루 레모네이드, 파도 자몽에이드, 아이스 아메리카노, 딸기 스무디, 핫초코, 생수 500ml
- 기념품 (6): 아기 물범 인형, 해파리 무드등 (품절), 고래 키링, 바다 엽서 세트, 펭귄 머리띠, 별바다 머그컵

\* A discount type must be chosen before these tickets can be added. The discount changes the price per person: 장애인 우대 −10,000원, 경로 우대 −8,000원 (경로 우대 is for 대인 only).

## Patterns covered
- Korean/English toggle on the attract screen; both languages work end to end.
- Per-age quantity steppers in one ticket sheet. At least 1 person is required ("인원을 1명 이상 선택해 주세요.").
- A required discount type on some tickets ("할인 유형을 선택해 주세요."), with prices that change by type.
- Optional snack add-ons, multi-select up to 2. A 3rd pick shows "추가 선택은 최대 2개까지 가능합니다."
- Drink size R/L.
- 2+1 on 별사탕 츄러스: a separate "2+1 증정" line at 0원 is added automatically. Its quantity is floor(paid/2).
- 2 sold-out items with a 품절 overlay and an error popup when tapped.
- A side cart drawer with line delete and a confirmation.
- The membership popup after the first add.
- An order review screen and a payment-method screen.
- One popup (membership), confirmations (delete, clear all, go home, pay), and error messages (sheet errors, sold-out popup, empty cart).
- Prices are always shown as "4,500원", in English mode too.

## Quirks
- The language can be changed only on the attract screen. 처음으로 resets the language to Korean and clears the cart (after a confirmation).
- A ticket sheet becomes one cart line with qty 1 and a per-age breakdown, for example "장애인 우대 / 대인 1명 · 소인 1명". To change it, delete it and add it again.
- Choosing 경로 우대 disables 청소년/소인 and resets them to 0.
- Adding the same non-ticket item with the same options merges into one line.
- Tapping a souvenir adds it at once and shows a toast. Tapping again raises the quantity.
- The bottom-bar 장바구니 area opens the drawer. 주문하기 in the bar goes straight to review.
- The banner text also contains "별사탕 츄러스".
- Text merges in the DOM, for example a card reads "2+1⭐별사탕 츄러스4,500원" and the cart bar reads "장바구니3".
- Toasts stay until the next tap.
- `answer-key.json` lists all quirks.

## Answer-key notation
For the per-age groups (`age_*`, type `quantity`), each option id appears once per person: `["adult","adult","child"]` means 대인 2, 소인 1. Holdouts also have these extra fields:
- `language`: which language to use.
- `autoLines`: the free 2+1 line the kiosk adds by itself.
- `requestedButSoldOut`: sold-out items a customer asks for. They are left out of `expectedTotal`.
