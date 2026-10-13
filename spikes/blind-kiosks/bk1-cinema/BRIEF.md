# bk1-cinema: 별무리 시네마 스낵바 (Byeolmuri Cinema Snack Bar)

A static self-order kiosk for a fictional Korean cinema snack bar. Open `app/index.html` directly (no server, no network). It is built for a 560x980 portrait viewport.

## What is in it
- 32 items in 6 categories: 콤보 4, 팝콘 8, 음료 8, 스낵 5, 핫푸드 4, 디저트 3.
- Flow: attract screen → pickup choice (상영관 입장 전 수령 / 지금 바로 수령) → menu → options modal or combo wizard → upsell popup (after combos) → cart → order review → payment-method screen (the flow stops there).
- Fictional brand, items and wording. Item pictures are emoji; the category tab icons are inline SVG.

## Patterns
- **Combo builder wizard**: tapping any combo opens 콤보 선택 → 팝콘 사이즈 → 팝콘 맛 → 음료 → 확인, with 다음/이전 buttons (step 1 shows 취소, step 5 shows 장바구니 담기), a step indicator and a running price.
- **Required popcorn size with price deltas**: S/M/L (+0 / +1,000 / +2,000원) with no default for standalone popcorn. Combos offer M (기본) / L (+1,000원).
- **Half-and-half**: 반반 팝콘 and the combo flavor 반반 require exactly 2 of 5 flavors. A 3rd pick is blocked with an error, and fewer than 2 gives an error on 담기/다음.
- **2-drink combos** use −/+ counters that must add up to exactly 2 cups. Per-cup drink upcharges apply.
- **Paged grid**: 6 per page with ◀ / ▶ pager divs. 팝콘 and 음료 have 2 pages.
- **Icon-only category tabs**: the `<button role="tab">` has only an SVG and an `aria-label`. There is no visible category text anywhere.
- **Upsell popup** after every combo add: "바삭한 나쵸도 함께 드릴까요?" offers 나쵸 at 3,000원 (regular 4,000원).
- **Sold out** (품절 overlay): 패밀리 콤보, 트러플 팝콘, 자몽에이드.
- **Pickup choice** takes the place of dine-in/takeout. It does not change the price.
- **Defaults vs no defaults**: drink size defaults to R. 아메리카노 HOT/ICE and 슬러시 flavor have no default. Sauces and seasonings have defaults.
- **Direct add**: items without options go straight to the cart on tap and show a toast.
- **Merging**: identical cart lines merge.
- Popup: the upsell. Confirmations: 전체 삭제 and 처음으로. Errors: required options, half-and-half count, drink count, sold-out taps and an empty cart.
- Markup mixes real `<button>`s with clickable `<div>`s (menu cards, option chips, pager, upsell "네, 추가할게요", pickup "상영관 입장 전 수령"). Card text merges in the DOM, e.g. "카라멜 팝콘5,500원".

## Quirks
- 반반 has a flat price: the chosen flavors never change it.
- 스페셜 콤보 includes a fixed 클래식 핫도그 with no options.
- Combos are always added with qty 1. Change the quantity in the cart.
- Toasts stay until the next tap. There are no timers, clocks or randomness.
- Cart "−" does nothing at qty 1. Use "✕" to remove a line. A line can hold at most 9.

## Files
- `app/`: `index.html`, `js/data.js` (menu), `js/kiosk.js` (behavior), `css/kiosk.css`.
- `answer-key.json`: menu, option groups, the promotion, 10 holdout orders with expected totals, and quirks.
- `selfcheck/selfcheck.mjs`: places holdouts h2, h3 and h6 in headless Chrome, then prints the payment-screen total next to the expected total. Run it with `node selfcheck/selfcheck.mjs` (add `--shots` for screenshots).
