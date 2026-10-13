# Phase 9 design review (9-polish:0)

A fresh look at KIBO as a whole, the way a judge meets it: `/` → `/demo` (three places) → the phone and kiosk screens. Review only; steps 1 (kiosk) and 2 (phone, `/demo`, landing) fix.

## How it was done
- `npm run lint`, `npm run test` (701 passed), `npm run qa:ui` (25 passed, 0 H; 249 states, screenshots in `phases/9-polish/qa/`), then `QA_ALL=1` through a `node` child process with output to `qa-output/` so this phase's report stays intact (see "T misses" below). `npm run build` ran after the QA runs.
- Every screenshot read at its main viewport (kiosk 1080×1920, phone 390×844, `/demo` and `/` 1440×900), and the small sizes where a journey's key moment lives (phone 360×800 and 320×700, `/demo` 1280×720). Checked against UI_QA V1–V12, the UI_GUIDE anti-patterns, UX heuristics and R-001–R-009.
- Journeys J1–J3 walked on the screenshots in their order and against the E2E specs (`e2e/qa/*.qa.spec.ts`, `e2e/demo*.spec.ts`).
- No product code changed.

## Observations from the orchestrating session, checked
| Observation | Holds? | Item |
|---|---|---|
| D1 at 1440×900 leaves the right half empty | No longer: the three place cards fill it since 7-environments:5. D1's remaining problems are alignment and tiny captures | X5, X4 |
| D2 at 1440×900: wide empty margins, kiosk text about 11px | Margins hold: about 154px each side (`demo-D2-empty-1440x900.png`). The kiosk is height-bound, (900−72)×9/16 = 466px wide, scale 0.43, so 40px kiosk text renders at about 17px, not 11px | X2 |
| "AI가 담았어요" toast covers the top row of tiles | Holds; it covers the very tile it announces | K1 |
| K2 has no way back and no small QR (I-048) | Holds, and the lower 40% of K2 is empty | K5 |
| `/` reads like a document; small hero screenshot | Holds; the hero capture's text is about 7px | X4 |
| Airport rail tiles show "5,500원부터" (child fare) | Holds (I-119) | K4 |
| Demo counter overlaps the rail brand | Holds (I-113), and the counter itself is stuck at "0번 · 0초" in Korean | K2 |
| "What the AI did" open squeezes the phone's cart to one line | Holds (`demo-D2-actions-open-1440x900.png`, about 280px of scroll area) | X3 |

## Punch list
P0: none found (nothing broken, unsafe or disqualifying). 23 items, ranked by what changes a judge's impression first.

### Kiosk (step 1)

**K1 · P1 · K3, KX: the AI pill and the staff banner cover what they talk about.** The 2 s "AI가 담았어요: 치즈버거 세트" pill sits over the top of the ringed tile and the first category (`kiosk-K3-ai-highlight-1080x1920.png`, `demo-D2-ai-highlight-1440x900.png`); the 60 s staff banner covers the category rail's first item and the top tile row (`kiosk-KX-staff-1080x1920.png`). The highlight is the judge's proof that the kiosk moved (J3 "Judge"). Code: `src/components/kiosk/MenuScreen.tsx:184` (`absolute inset-x-12 top-6`), `src/components/kiosk/KioskBanners.tsx:38` (`absolute inset-x-12 top-64`). Fix: give both their own row: the pill replaces the toolbar's left side (where the dine chip sits) for 2 s, the banner pushes the rail and grid down while it shows. Rule R-006; I-045.

**K2 · P1 · `/demo` kiosk header: a stuck Korean timer.** "터치 0번 · 0초" shows on every `/demo` kiosk screen and never moves, because nobody taps the kiosk in the demo (`demo-D3-done-1440x900.png` still says 0초 after payment); on the airport rail it covers "RAIL" (`demo-D2-rail-empty-1440x900.png`). Code: `src/components/kiosk/DemoCounter.tsx:22`, passed by `DemoApp`'s `demo`. Fix: render the counter only for the `/kiosk?…&demo=1` measurement, not inside `/demo`. I-135, I-113.

**K3 · P1 · `/demo` kiosk toolbar: [다른 휴대폰 연결] ends the judge's own demo.** It is visible on K3 and K6 in `/demo` (`demo-D2-ai-highlight-1440x900.png`) and calls `reissueClaim` (`src/components/kiosk/KioskToolbar.tsx:30`), which voids the demo's device token; every later phone action fails until [Try again]. Fix: hide the button when the kiosk is embedded in `/demo` (the same split as K2). I-066.

**K4 · P1 · K3/K4 airport rail: the tile price is the child fare.** "직통열차 시티센터 5,500원부터" (`kiosk-K3-rail-menu-1080x1920.png`) reads as the ticket price; the adult fare appears nowhere on K3, and the K4 passenger step shows only deltas ("어린이 −5,500원", nothing for 어른) (`kiosk-K4-rail-passenger-1080x1920.png`). J2 Mei sees one price on the kiosk and twice that on her phone. Code: `src/lib/kiosk/menu.ts:15–24` (`formatFrom`, `lowestPrice`), `src/components/kiosk/MenuScreen.tsx:247`. Fix (assigned to step 1): the tile shows the default option's price (adult, no "부터"); on ticket kiosks the passenger buttons show each fare in full ("어린이 5,500원"). I-119.

**K5 · P2 · K2: no way back, no small QR, 40% empty.** Below the two dine cards the canvas is empty from y≈1200 to 1920 (`kiosk-K2-dine-1080x1920.png`); there is no [처음으로] and no QR (UX Flow B "small QR on every screen", heuristic 3). Code: `src/components/kiosk/KioskScreen.tsx:315`. Fix: `KioskToolbar` on K2 (it already exists on K3/K6) and a [처음으로] low on the screen; the dine cards can grow into the space. I-048, R-008.

**K6 · P2 · `/demo?k=doughhouse`: the widget hides two pizza tiles; the page's text is about 7px.** The KIBO widget (`w-72`, top right) covers the third and fourth tiles (`demo-D2-learned-added-1440x900.png`); on `/learned/doughhouse` the page itself is drawn at 0.56×, its 12–14px text at about 7–8px (`learned-widget-added-1440x900.png`). Fix: in `/demo`, put the widget in the letterbox under the page (or one status line under the column caption); the page cannot be restyled, so say "The pizza kiosk's own page, unchanged" in the caption. I-101, I-096, R-006.

**K7 · P2 · K3/K4 airport rail: names break inside a range.** "청소년 (13– / 18세)", "어린이 (6– / 12세)" (`kiosk-K4-rail-passenger-1080x1920.png`) and the rail item "교통카드· / 이용권" (`kiosk-K3-rail-menu-1080x1920.png`). Fix: a no-break hyphen (U+2011) in the data's age ranges, or the age range as the button's second line; `whitespace-nowrap` on the range. I-109.

**K8 · P2 · K4 in English: lowercase variant buttons.** "single / set / large set" (`kiosk-K4-variant-en-1080x1920.png`) next to capitalized labels everywhere else. Fix: capitalize on the K4 buttons only (`VARIANT_WORD` must stay lowercase inside line titles). I-120.

**K9 · P2 · K3/K6: a cart line's options cannot be edited (decision, no polish fix).** "Both fries to large" by touch means [전체 삭제] and re-adding both sets: 41 taps in `evidence/touch-hero.json` against 19 in the prototype. This inflates the touch side of the touch-vs-voice number the deck will show. Step 1 must not add features: leave for the user, and if kept, the deck states the path next to the number. I-039.

**K10 · P2 · all kiosk screens: T misses on line height and spacing.** Body `k-text-40/48` line height 1.35/1.3 (target 1.5) and 40px gaps/paddings off the 4/8 scale, on nearly every kiosk state (`phases/9-polish/qa/ui-qa.jsonl`). Cheap only if nothing overflows: try line height 1.5 on multi-line body text only (cart chip sub-lines, K7 note "체험용 결제예요…"), not on one-line labels; 40 → 32 or 48. I-041, I-042.

### Phone, `/demo`, landing (step 2)

**X1 · P1 · P4 (`/assistant` and `/demo`): the talk footer covers [Yes, pay now].** The footer (mic pill, AI voice, "You can also say yes.", text input, about 200px) stays on the confirm screen. `/assistant` 360×800: only the button's top edge shows; 320×700: total and button both below the fold (`assistant-P4-confirm-360x800.png`, `-320x700.png`). `/demo` 1440×900: half hidden with three MALO lines, a sliver with three rail tickets; 1280×720: hidden (`demo-D2-confirm-1440x900.png`, `demo-D2-rail-confirm-1440x900.png`, `demo-D2-confirm-1280x720.png`). R-009's E2E passes only because part of the button is in the viewport. Code: `src/components/assistant/AssistantPanel.tsx:385–405`. Fix: on P4 the bottom area holds the total and [Yes, pay now] (88px) and a compact mic button with "You can also say yes."; the text input moves behind a small [Type] button there; assert `toBeInViewport({ ratio: 1 })` at 320×700 and in the three `/demo` confirm states. I-134, R-009, J1 "Pay".

**X2 · P1 · D2 first view at 1440×900: the best feature is hidden and the sides are empty.** The scenario guide (the only place that says "The AI cannot pay" as something to try) is closed behind a small [Scenarios] toggle while about 154px of cream sits on each side (`demo-D2-empty-1440x900.png`); the kiosk cannot grow, it is height-bound at 466px. Code: `src/components/demo/ScenarioGuide.tsx:41` (`useState(false)`). Fix: open the guide by default from 1440px wide, the same breakpoint as the action strip (`src/components/demo/ActionStrip.tsx:15`), so the third column fills the space and a cold judge sees "Play it for me" first; keep it closed below. I-132, J3 "Land/Try".

**X3 · P1 · Phone chrome takes the screen on small phones and in `/demo`.** At 360×800 the header wraps to two rows ([Call staff] alone, header 136px instead of 72px) and the footer is about 209px, leaving about 455px (`assistant-P2-dine-360x800.png`); the learned kiosk's header wraps already at 390 (`assistant-P4-learned-confirm-390x844.png`), so the staff button moves between screens (V4). In `/demo` with "What the AI did" open, the cart shows only its title (`demo-D2-actions-open-1440x900.png`). Fix: one-row header below 400px (language as an icon button with an accessible name), the AI voice switch inside the mic row, and in `/demo` the action strip collapsed to its count while the cart has lines (or moved to the bottom of the scenario column, which X2 opens). I-084.

**X4 · P1 · `/` first screen: nothing a judge can read shows the product.** The hero picture is a full-page capture of `/demo` with its cream margins, drawn 633px wide, so the kiosk and phone text is about 7px (`home-landing-hero-1440x900.png`, `src/app/page.tsx:93`); "How it works" captures are about 140px wide, D1's place-card captures about 170px. Every section has the same weight. Fix: recapture tight crops (kiosk + phone only, no demo chrome, 2× device scale) in `scripts/landing-shots.ts`; on `/` the hero picture becomes the largest element of the first screen (full width under the headline at ≥ 1024px), with the AI-added tile and the cart readable; one cropped region per "How it works" step. I-136, J3 "Land".

**X5 · P2 · D1: cards misaligned, [Start] floating.** "Pizza shop, no integration" wraps, so the three cards' second lines start at different heights; [Start] spans about 58% of the card row; the pizza capture is mostly empty page (`demo-D1-intro-1440x900.png`, `src/components/demo/DemoIntro.tsx:81,91`). Fix: shorter title ("Pizza shop") with "no integration" in the second line, [Start] as wide as the card row, the pizza capture cropped to its tiles and cart. I-123.

**X6 · P2 · Phone on the ticket machine still says "order".** "Your order", "Nothing in your order yet.", "Please check your order" on `/demo?k=airport_rail` (`demo-D2-rail-empty-1440x900.png`, `demo-D2-rail-confirm-1440x900.png`) while the kiosk says 승차권 / tickets. Fix: ticket wording in `src/lib/i18n/phone.ts` by `kiosk.domain` ("Your tickets", "Please check your tickets"), like `ticketPlaceholder`. I-116 (phone part), R-007.

**X7 · P2 · P5 → K7 payment handoff.** The phone says "Insert your card into the kiosk" while the kiosk first asks 결제 방법을 골라 주세요 in Korean; in `/demo` the stand-in says "Tap the card on the kiosk", and the P5 picture points right while the kiosk is on the left (`demo-D2-rail-payment-1440x900.png`, `demo-D2-payment-1440x900.png`). J2 Mei cannot read the kiosk's step. Fix: P5 names the kiosk's own button ("Tap 카드 (Card) on the kiosk, then insert your card"), one verb in the stand-in, picture mirrored in `/demo`. I-118, I-069.

**X8 · P2 · Ticket placeholder cut.** "e.g. Two adult tickets to City Cent" (`demo-D2-rail-empty-1440x900.png`). Fix: "e.g. Two adults to City Center". I-133.

**X9 · P2 · Learned kiosk: placeholder rings where photos go.** The cart line on `/demo?k=doughhouse` and the phone's P2 dine buttons show a grey ring (`demo-D2-learned-added-1440x900.png`, `assistant-P4-learned-confirm-390x844.png`); it reads as a broken image. Fix: no photo slot on learned kiosks (text-only lines and dine buttons). I-103.

**X10 · P2 · Two English price formats.** Phone "6,900 won", kiosk "₩6,900" (`assistant-P3-two-lines-390x844.png`, `kiosk-K3-menu-en-1080x1920.png`); UX heuristic 4 asks for one format. Fix: the phone uses the kiosk's `formatWon` (`src/lib/kiosk/menu.ts`). I-137.

**X11 · P2 · D2 finished scenario: "Your turn" half under the guide's edge.** At 1440×900 "Your turn: tap Yes, pay now…" is cut at the bottom of the guide (`demo-D2-scenario-finished-1440x900.png`). Fix: scroll it into view when the last step ticks, or show it above the checklist once finished. I-131, R-009.

**X12 · P2 · QA screenshots that feed the deck show blank photos and stray focus rings.** Blank MALO dine photos at 390×844 (`assistant-P2-dine-390x844.png`) and a blank cart photo and two blank kiosk tiles in `demo-D2-ai-highlight-1440x900.png`, although the same images show in the next shots; focus rings left from the previous state's focus check on `assistant-P6-done-390x844.png` (frame) and `kiosk-KX-staff-1080x1920.png`. Code: `e2e/qa/checks.ts:344` waits only for fonts. Fix: wait for every visible `img` to be complete and decoded, and blur the active element, before each screenshot. I-138, I-121.

**X13 · P2 · `/demo` on a phone is cut off.** `/` offers [Try the live demo] on any device, but the split has fixed widths (`src/components/demo/DemoApp.tsx:54,85`). Fix: below about 900px wide, `/demo` shows "Open this on a laptop" with a link to two-device mode (`/kiosk`). I-074.

## Journeys: where a person would hesitate
| Journey, stage | Hesitation on the real screens | Item |
|---|---|---|
| J1 Sunja, Connect | P1 picture hint and [Type instead] are clear (`assistant-P1-mic-hint-390x844.png`) | — |
| J1 Order | Kiosk highlight works, but its pill hides the highlighted tile | K1 |
| J1 Fix | "Make both fries large" works by voice; by touch it needs clear-all and re-adding | K9 |
| J1 Pay | On a 360px phone she sees the total but not [Yes, pay now]; at 320px neither | X1, X3 |
| J1 After | Order number large and kept (`assistant-P6-done-390x844.png`) | — |
| J2 Mei, Order | Kiosk tile says 5,500원 "from"; her phone says 11,000 won for an adult | K4 |
| J2 Order | Phone says "order" while the machine says tickets | X6 |
| J2 Pay | Phone says insert the card; the kiosk asks a Korean question first | X7 |
| J3 Judge, Land | `/` hero text unreadable; D1 cards uneven | X4, X5 |
| J3 Try | Guide closed, sides empty; a timer stuck at 0 in Korean on the kiosk | X2, K2 |
| J3 Try | One tap on [다른 휴대폰 연결] breaks the demo | K3 |
| J3 Judge | The confirm card's pay button is half under the phone footer (rail: hidden) | X1 |
| J3 Leave | D3 [Try again] and "Try another place" work (`demo-D3-done-1440x900.png`) | — |

## T misses (`QA_ALL=1`)
The normal run logs every T miss in `phases/9-polish/qa/ui-qa.jsonl` (H 0 across 249 states). All of them belong to known rows; no new kind: axe contrast "incomplete" for human review (I-043; checked by eye on the screenshots, all dark text on light or white on teal/navy), kiosk line height 1.3–1.35 (I-041), kiosk 40px and K2 96px spacing (I-042), and the `mt-auto`/`mx-auto` margins on `/` (checker false positives, I-075, R-004). One real off-scale value on `/`: a 30px padding on the place-card links (`a.flex.min-h-15`), cheap to fold into X4. The `QA_ALL=1` run (`qa-output/ui-qa.jsonl`): 13 specs passed, 12 failed on T misses only, H 0 across the same 249 states.

## Issue log (this step)
New rows: I-134 (X1), I-135 (K2), I-136 (X4), I-137 (X10), I-138 (X12). New occurrence added to I-084 (X3). I-103 notes that the MALO dine photos do show (the blank shot is I-138). No class reached its third occurrence: `small-screen-crowding` 2, `qa-screenshot-artifact` 2; `below-fold-action` already has R-009, which X1 shows is not met at 1440×900 for the rail confirm.
