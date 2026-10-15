# Measuring touch vs talk by hand

The `/demo` comparison card (D3) and the deck may show human timings only from `evidence/human-runs.json`
(docs/PRD.md "Demo scenario" step 8, docs/TESTING.md "Measurements", R-001). Until that file exists, the card shows
the automated tap count only (`evidence/touch-hero-efficient.json`).

## The order
The hero order: two cheeseburger sets with large fries, one with zero cola and no pickles, one with cider; eat here;
no dessert. Total 14,800원. Every run must end on this cart; a run that ends on another cart is thrown away.

## Setup
- The deployed app or `npm run dev`, Chrome on a laptop at 1440×900 or larger. Close other tabs.
- Three people who have not seen the kiosk today (the same three for touch and talk). Write a letter for each
  (A, B, C), never a name.
- Each person reads the order on a card once, then keeps the card.

## Touch runs (3)
1. Open `/kiosk?k=malo&demo=1`. The counter at the top right shows taps and seconds.
2. The person taps "화면을 눌러서 주문" and orders by touch only. Nobody helps.
3. At the order number, copy the counter's taps and seconds. The counter starts at the first tap after K1 and stops
   at payment (`data-taps`, `data-seconds` in DevTools give the same numbers).

## Talk runs (3)
1. Open `/demo`, choose MALO BURGER, press [Start].
2. The person orders by voice or typing on the phone half, then taps [Yes, pay now] and the card stand-in.
3. At the order number, copy the comparison card's "This order with KIBO" column: messages, phone taps,
   kiosk taps, seconds. The card says "The same order by touch" only when the cart is the hero order.

Alternate who goes first (A touch then talk, B talk then touch, C touch then talk), so learning the menu does not
favor one side.

## Saving
Copy `evidence/human-runs.template.json` to `evidence/human-runs.json`, replace the example rows with the six runs
(dates in KST, `YYYY-MM-DD`), delete the `about` example note if it no longer fits, and commit. The card then shows the
median of the touch runs (rebuild or restart the dev server: the file is bundled at build time). Add a row to the
docs/TESTING.md evidence ledger with the medians.

## Re-measuring the automated run
`EVIDENCE=1 npx playwright test kiosk-touch-efficient` rewrites `evidence/touch-hero-efficient.json`. A normal
`npm run test:e2e` keeps the committed file and writes its run to `test-results/evidence/` (I-099, R-021).
