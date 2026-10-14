# Kiosk polish (14-final:2)

Owner feedback on the video (10-14): "the kiosk quality is low; the pizza kiosk looks unfinished, the burger kiosk needs work too". UX judge (10-13): product photos still blank when the first AI highlight fires; the dine photos blank.

Before and after screenshots: `phases/14-final/qa/kiosk-polish/before/` and `after/` (MALO and airport rail from `npm run qa:ui` at 1080×1920; the pizza page from `pizza-shots.mjs` at 1080×1920 and 1080×1600, the size it is learned at and shown at). The current QA screenshots are in `phases/14-final/qa/`.

## Gaps against a finished commercial kiosk, and the fix

| # | Screen | Gap | Fix |
|---|---|---|---|
| 1 | All MALO | The header mark was a capital "M" on a yellow rounded tile: next to a burger, viewers can read it as a real fast-food chain's logo (IP risk, video expert 10-14) | A drawn mark: a cream speech bubble with a line burger in the kiosk's teal (`BrandMark.tsx`); ticket machines get a train face. A mustard stripe under the header. No letter on a coloured tile anywhere |
| 2 | K3, K2, K4 | Photos were lazy and fetched per screen, so the first AI highlight and the dine cards could show empty photo slots | Every item, option, category and dine picture is fetched on K1 with the srcset the screens use (`preloadKioskImages`), one `sizes` for item photos everywhere, `loading="eager"` |
| 3 | K1 | The hero was a cropped photo with nothing on it; the store said nothing about itself | The store's own offer on the hero from menu data (its NEW item, else BEST, with the tile price); hidden when large text shrinks the hero |
| 4 | K1 | Language buttons were two loose outlined boxes | One segmented control (the chosen language is the dark half) |
| 5 | K2 | Two black-outlined cards on the top half, an empty bottom half | Photo cards fill the free height, soft shadow instead of outlines, a chevron on each choice |
| 6 | K3, K4, K5, K6 | Flat white cards with a 4–6px beige outline; outlines, shadows and radii differed per screen | One card style (`CARD_SHADOW`: white, two-layer soft shadow, 32px radius) on tiles, choices, the upsell, review lines, the pairing panel and the attract cards |
| 7 | K3 | Price 40px, the same size as the name and the kcal line, so nothing led the eye | Name 48px, price 56px Space Grotesk in the kiosk colour, kcal 40px beside the price; all tiles in a row end level |
| 8 | K3 | The cart bar was a white strip with a border line; the total read like a label | A lifted cart panel (rounded top, upward shadow), total 72px, chips on the panel tint, a chevron on the order button |
| 9 | K3 | Selected category was shown by the rail tint only | The selected category's icon also gets a ring in the kiosk colour |
| 10 | K6, K7 | Summary areas were a border line under the list | The same lifted panel as the cart bar |
| 11 | K7 | The card drawing was a flat rectangle over a black bar | A card with chip and number marks sliding into a reader slot, and the arrow in a tinted circle |
| 12 | K8 | A bare number floating in an empty screen | The number on a white ticket-like card with a check mark and a dashed tear line |
| 13 | Pizza (Doughhouse) | An unstyled page: system buttons, 16px text, plain fieldsets, a black strip for a cart | A finished kiosk look in its own brand (red bar with a drawn slice and "도우하우스 · DOUGHHOUSE PIZZA", a pizza on the start screen, pill tabs, three-column picture cards, chip-style options, centred option sheet over a dimmed page, a white cart panel with a large 주문하기). CSS and background pictures only, plus one `data-cat` attribute |
| 14 | Pizza | Sold-out item looked like the others | Greyed card with a large 품절 stamp on the picture (still the card's most prominent text, so its label stays 품절) |
| 15 | K6 | The middle of the review stays empty with one or two lines | Accepted: the list grows with the order; the summary panel stays at the bottom where the hand is |

## What did not change
- Every label, accessible name, role, `data-*` hook, flow, menu item and price. The touch hero order is still 24 taps (`e2e/kiosk-touch-efficient.spec.ts`).
- On the pizza page: every text node, element, handler and the DOM order. `node --test spikes/kibo-learn/restyle.test.mjs` walks 14 screens and compares the tappable labels, the accessibility tree and the cart text the bridge parses with `spikes/kibo-learn/fixtures/doughhouse-screens.json`, written from the page before the restyle: identical. The run 3 holdout orders replay 4/4 with the rule violation detected (`spikes/kibo-learn/results/run3/holdout.restyled.log`), the coverage audit regression passes 4/4, and `e2e/learned.spec.ts` passes unchanged.

## Still to do elsewhere
- The landing and `/demo` place pictures are recaptured in this step (`npm run shots:landing`; the pizza picture is now taken in the page's own 1080×1600 frame, because at 540 wide the fixed cart panel filled it); deck pictures and video footage still show the old "M" tile until steps 8 (shots-final) and the video edit retake them.
- `design/prototype/` keeps the old mark; it is reference only and not shipped.
