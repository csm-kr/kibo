# bk7-bubbletea — 펄린당 (PEARLIN TEA HOUSE), Yeonnam branch

A fictional Taiwanese-style bubble tea shop in Seoul. Static self-order kiosk, portrait 720×1280.
Open `app/index.html` directly (file:// URL). No network, no build, no frameworks; item pictures are emoji on colored tiles.

## Files
- `app/index.html`, `app/style.css`, `app/menu.js` (menu master), `app/app.js` (screens, popups, pricing)
- `answer-key.json` — full menu, option groups, fees, 10 holdout orders with expected totals
- `selfcheck/run.js` — cross-checks the key against the app data, recomputes holdout totals from the key, then places all 10 holdouts in the app with Playwright and compares the review and payment-screen amounts; writes `selfcheck/RESULT.txt`
- `selfcheck/screens.js` — screenshots of each screen into `selfcheck/shots/`

Run: `node selfcheck/run.js` (uses Playwright from the kibo repo by absolute path).

## Screens
1. Attract: logo, winter banner, "화면을 터치하여 주문을 시작하세요", 한국어 / English buttons.
2. Order type: 매장 식사 / 포장. The take-out card says 200원 per drink cup is added.
3. Menu: 6 tabs (밀크티 7, 과일티 6, 치즈폼 5, 커피 5, 스낵 5, 겨울 시즌 3 = 31 items), 3-column grid, cart panel at the bottom.
4. Option modal: size, temperature, ice, sweetness, extra shot, toppings or flavor, quantity, "N원 담기".
5. Set modal (every drink): 1/3 drink only or 스낵 세트로 변경 (-800원), 2/3 choose snack, 3/3 confirm set price.
6. Stamp popup: once per session, right after the first item is added.
7. Order review: order-type switch, lines, 주문 금액, set-discount note, 포장컵 비용, 총 결제 금액.
8. Payment method: 결제하실 금액, card / mobile pay / mobile coupon; choosing one shows "insert card" guidance and stops.

## Patterns
- Eat-in / take-out at the start. Take-out adds a 200원 disposable-cup fee per drink (snacks excluded, set drinks included). Like many small shops, the fee is not baked into item prices. It is shown on the take-out card, in the menu header badge, as its own cart-summary line, as its own review line, and it is included in the payment amount. The order type can also be switched on the review screen.
- Size M/L required (default M): tea L +700원, coffee L +500원.
- Sweetness 0/30/50/70/100% required, no default (tea drinks only; coffee has none).
- Ice none/less/regular/extra required, no default. Temperature ICE/HOT defaults to ICE. HOT hides the ice group and clears it. ICE ONLY items have no temperature group. HOT ONLY seasonal items have neither temperature nor ice.
- Toppings: multi-select, max 3, 9 toppings with their own prices (500–1,000원), 2 sold out (disabled). A 4th pick shows an error.
- Extra espresso shot: quantity stepper 0–2, +500원 each (coffee only).
- 지파이 has a required flavor choice (치즈 시즈닝 +500원).
- Drink + snack set: 3-step modal, -800원 per set. The set shares the drink's quantity. 에그타르트 is sold out, and 지파이 is not offered as a set snack.
- Stamp popup must be closed (적립 안 함 / X / phone keypad). It has no price effect.
- Cart: +/- quantity (− disabled at 1, max 20), X delete with confirmation, 전체삭제 with confirmation. Identical lines merge.
- Errors and popups: missing required option, topping max, set without snack, empty cart, sold-out item, wrong phone length, and the 처음으로 confirmation.
- Korean/English toggle on the attract screen only. Prices stay "4,500원" in English.
- Markup mixes `<button>` and clickable `<div>`. Menu card name and price share one element.

## Determinism
No timers or clocks drive behavior. There is no inactivity warning. The winter category is a fixed menu, not time-limited. The only CSS animations are cosmetic (blinking prompt).

## Holdouts
10 orders (h1–h10). Each lists its order type, its language, and the expected total as shown on the payment screen. Option ids for the quantity group repeat once per unit (`"shot": ["extraShot","extraShot"]`). The set appears as `setChoice` / `setSnack`.
