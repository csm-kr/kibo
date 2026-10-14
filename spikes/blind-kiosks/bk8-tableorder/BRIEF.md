# bk8-tableorder — 달무리화로 table-order tablet

A fictional Korean charcoal-BBQ and noodle restaurant, 달무리화로 ("Dalmuri Hwaro"). This is the tablet fixed to table 12 (landscape 1280×800). Guests order from the table and the order goes to the kitchen. Nothing is paid at the table: the guest pays at the counter after the meal. The brand, items, wording, and the CSS logo (a flame and a crescent moon) are made up. Item pictures are emoji on colored tiles.

Open `app/index.html` straight from disk (file://). It needs no network, no build step and no framework. Everything is held in memory, so reloading the page starts a fresh, empty table.

## Screens
1. **Attract / start screen**: brand, `12번 테이블`, `화면을 터치하면 주문이 시작됩니다`, and a `주문 시작` pill. `직원 호출` and the language button sit in the top right. Touching anywhere else opens the menu. There is no dine-in/take-out step.
2. **Menu**:
   - The header has the brand, `12번 테이블`, `주문 내역` (showing the running table total), `직원 호출`, and the language button.
   - Category tabs are on the left: 고기 7, 식사·면 7, 찌개 5, 사이드 6, 주류·음료 8, 디저트 4 (37 items).
   - The item grid is in the middle. The `주문 담기` list is on the right, with `주문 금액`, `주문하기`, and `결제는 카운터에서 해주세요`.
3. **Item popup** (meat, noodles, stews): option groups tagged 필수/선택, then a `인분` stepper (meat) or a `수량` stepper (others). Below them are an inline error line and the buttons `취소` and `주문 담기 | 금액`. Sides, rice, drinks and desserts have no options; one tap adds them and a toast confirms.
4. **Alcohol age check**: on the first alcohol tap, a popup shows `주류 주문 확인` and `만 19세 이상이십니까?` with 아니오/예.
5. **Order review**: `주문하기` opens the `주문 확인` popup with the lines, the total, and `아래 메뉴를 주방으로 주문할까요?`. `돌아가기` goes back; `주문하기` sends the order.
6. **Order sent** (end point): `주문이 주방으로 전달되었습니다`, `12번 테이블 · N차 주문`, `이번 주문 금액`, `테이블 총 주문금액`, and the pay-at-counter note. The buttons are `주문 내역 보기` and `추가 주문하기`.
7. **주문 내역**: every sent order (1차, 2차, …) with its lines and amount, plus `테이블 총 주문금액`.

## Patterns
- **Meat by portions.** The meat popup has a `인분` stepper that starts at 1인분 and moves in steps of 1. Each card shows its price per 1인분 and its weight.
- **First meat order minimum.** Until an order with meat has been sent, the meat portions in the list must total at least 2.
  - When the user adds meat and the list would hold fewer than 2 portions, the popup shows the inline error `첫 고기 주문은 2인분 이상부터 가능합니다`.
  - If the list is reduced to 1 meat portion, `주문하기` shows the same message in a `알림` popup.
  - Additional orders after a meat order can be 1인분.
- **Alcohol age confirmation.** It covers 소주, 맥주 (병), 생맥주 500cc, 막걸리 and 복분자주 (each has a red `19` badge). `예` is remembered until reload. `아니오` adds nothing and shows `만 19세 미만은 주류를 주문할 수 없습니다`.
- **Noodles.**
  - 냉면 and 막국수 require `물/비빔 선택` (물/비빔, no default) and offer an optional `곱빼기` (+2,000원).
  - 후식 냉면 has only 물/비빔.
  - 잔치국수 has only 곱빼기.
- **Stews.**
  - 김치찌개, 순두부찌개 and 부대찌개 (2인분) require `맵기 선택` (single choice, no default).
  - All of them plus 된장찌개 have optional `추가 재료` (multi, max 2). A third choice is rejected with `최대 2개까지 선택할 수 있습니다`.
  - 갈비탕 has no options.
- **Staff call (직원 호출).** It is its own popup with 물, 냅킨, 물티슈, 불판 교체, 앞접시 and 수저 세트 (multi-select). Requests are free. They show only a toast and never enter the list, the orders, the history or any total. Calling with nothing selected shows `요청할 항목을 선택해 주세요`.
- **Sold out.** 차돌박이 and 수정과 have a `품절` cover; tapping them shows the toast `품절된 메뉴입니다`.
- **Popups, confirmations and errors.**
  - Popups: item, staff call, language, history.
  - Confirmations: age check, `전체 삭제` (`담은 메뉴를 모두 삭제할까요?`), the order review.
  - Errors: meat minimum, missing required option, add-in limit, empty order toast, staff call without a choice, age denied.
- **Languages.** The language popup offers 한국어, English, 日本語 and 中文. Category, item, option and UI labels change. Prices always stay in the form `16,000원`, and the brand name stays in Korean.

## Quirks
- The same item with the same options merges into one list line. In the list, `−` stops at 1 and `✕` removes the line.
- The order-sent screen has no timeout. Toasts fade after about 2 s; nothing else depends on time, and nothing is random.
- The markup mixes real `<button>`s (header, steppers, footers) with clickable `<div>`s (cards, tabs, options, chips, list delete, language options). Several labels run together in the DOM text, for example `생삼겹살150g16,000원/1인분`.

## Files
- `app/`: `index.html`, `style.css`, `data.js` (menu and translations), `app.js`.
- `answer-key.json`: menu, option groups, flow, quirks, and 10 holdout orders. Each holdout has `expectedTotal`, the table total after that order is sent. `startsAfter` marks the holdouts that follow an earlier one in the same session.
- `selfcheck/selfcheck.mjs`:
  - checks the answer key against the app data;
  - places all 10 holdouts through the UI with Playwright and compares the totals on the review, sent and history screens;
  - walks the error and confirmation paths.

  It writes `selfcheck/RESULT.txt`.
- `selfcheck/shots.mjs`: screenshots for a visual check (`selfcheck/shots/`).
