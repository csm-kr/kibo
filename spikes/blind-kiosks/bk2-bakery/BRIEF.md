# bk2-bakery: 포근밀 베이커리카페 (Pogeunmil Bakery Cafe)

A static self-order kiosk for a fictional bakery cafe. It has a Korean UI, no network access, no build step and no framework. Open `app/index.html` directly (file:// works). The kiosk frame is 540×960 px.

## Flow
1. Attract screen: tap anywhere.
2. Dine-in or take-out: '매장에서 먹어요' / '포장해 갈게요'. The choice does not change prices.
3. Menu: 6 category tabs, a 3-column grid and a cart panel at the bottom.
4. Option popup for items that have option groups. Items without groups go straight into the cart.
5. Order review, then '결제하기' and the confirmation '총 N원을 결제할까요?'.
6. Payment-method screen. Picking a method only shows a guide line. The flow stops here.

## Menu
There are 40 items in 6 categories: 커피 8, 논커피 6, 티 6, 빵 8, 케이크 6, 샌드위치 6. Three items are sold out: 딸기라떼, 앙버터 and 티라미수. The data is in `app/menu.js`, and `answer-key.json` lists every item and option group.

## Patterns
- **HOT/ICED is required and has no default.** Group `temp` has no surcharge. Group `tempUp` adds ICED +500원. Card prices show the HOT price.
- **ICE ONLY drinks** (`tempIced`) are 콜드브루, 레몬에이드 and 딸기라떼. ICED is pre-selected for them. 에스프레소 is HOT ONLY and has no temperature group.
- **Conditional group:** '얼음 양' (적게/보통/많이, default 보통) appears only while ICED is selected. Going back to HOT hides it, and choosing ICED again resets it to 보통.
- **Quantity-stepper option:** '샷 추가' works as − 0 +, costs +500원 per shot and allows up to 3. A 4th press shows an error. The popup also has a separate '수량' stepper.
- **Multi-select syrup:** up to 2 syrups. 흑당 is +700원 and the others are +500원. A 3rd pick shows '시럽은 최대 2개까지 선택할 수 있어요.'.
- '우유 선택' and '데우기' are pre-selected single choices. 오트 밀크 is +600원 and 두유 is +500원.
- **Cart:** each line has − qty + and ✕. − is disabled at 1, and ✕ deletes without asking. '전체삭제' asks for confirmation. Identical lines merge, and a line holds at most 9.
- **Popups and errors:** the option popup, the sold-out popup, the confirmations ('처음으로', '전체삭제', '결제하기'), and the errors (missing temperature, 3rd syrup, 4th shot, empty cart).

## Inactivity warning (fixed fake timer)
The kiosk uses no real clock. A tap counter stands in for the idle timer.
- The counter starts at 0 when the attract screen is tapped. That tap is not counted.
- Every later click inside the page counts, including clicks on empty areas. Clicks while the warning is open do not count.
- **Right after the 12th counted tap** the modal '계속 주문하시겠어요?' opens with '30초 후 처음 화면으로 돌아갑니다.'. The tap's own action has already been applied when the modal opens. The modal opens once per order, on top of whatever is showing.
- The number does not change on its own. Each tap on the dark backdrop outside the box counts as 10 fake seconds (30 → 20 → 10 → 0). At 0 the order is discarded and the attract screen shows '입력이 없어 주문이 취소되었습니다.'.
- '계속 주문하기' closes the modal and keeps the order. The modal's '처음으로' discards the order without asking.

## Markup quirks
- Clickable divs: tabs, menu cards, option chips, '주문하기', '처음으로', '메뉴 추가하기', '이전' and the payment methods. Real `<button>`s: steppers, ✕, '전체삭제', '담기', '취소', '결제하기' and the dialog buttons.
- Some text runs together in the DOM. A card reads like '☕아메리카노3,800원', an option chip like 'ICED+500원', and the add button like '4,800원 담기'.
- '결제하기' appears twice in a row: once on the review screen and once in its confirmation.

## Answer key conventions
- `holdoutOrders[].lines[].options` lists every option group that applies to the line. That includes defaults such as `ice: ["regular"]` and `milk: ["regular"]`, and empty arrays for unused multi or quantity groups.
- A quantity group repeats the option id once per unit, so `shot: ["shot","shot"]` means 2 shots.
- Dine-in or take-out is recorded in each holdout's `patterns`.
- The patterns tag `idle-warning` marks orders that normally take 12 or more taps.

## Self-check
`node selfcheck/selfcheck.cjs` places holdouts h1, h2 and h4 using hand-written steps. It uses Playwright from the repo with the installed Chrome. It prints the total on the payment screen next to the expected total, and records the syrup and shot errors and the inactivity warning along the way.
