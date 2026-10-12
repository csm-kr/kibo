# PRD: KIBO (Kiosk Intelligence Bridge & Operator)

## Goal
Let anyone order at an existing self-order kiosk by talking to their own phone, without replacing the kiosk.

One-line pitch: **"Don't learn the kiosk. Just talk."** Say one thing to your phone and the kiosk on the counter moves by itself until the order is done. Kiosks with no integration are connected by KIBO Learn.

## Problem
- Self-order kiosks are everywhere, but older adults, people with low vision or speech/hearing difficulties, and visitors who cannot read Korean get stuck: many screens, small text, set/side/drink sub-steps, upsell pop-ups, time pressure from the queue.
- Most kiosks do not take voice orders. Barrier-free models offer voice *guidance* at best. Adding voice ordering to the kiosk means new hardware (mic, speaker) and compute.
- Korea's barrier-free kiosk requirement took full effect on 2026-01-28 for new installs, with existing units due by 2027-01-28 (reported; fines up to KRW 30M; barrier-free units cost about 3× a standard one). KIBO does **not** claim to satisfy the legal requirement (height, braille, sign language); it is a software complement that adds voice, language and large-text access to kiosks already installed. Verify the decree text before quoting it.

## Why the phone
- Everyone already carries the mic, speaker, compute and personal settings (language, font size, screen reader). The kiosk only needs to show a QR and accept commands, which is software.
- **Learn once, use everywhere.** The same phone and the same way of speaking work at every kiosk; users never relearn each kiosk's UI.
- No app install: scan the QR, a web page opens. The first time needs one microphone permission; the UI shows a large hint before the browser prompt.

## Users
| Persona | Situation | What the design must give them |
|---|---|---|
| Sunja, 72, Korean (primary) | Uses chat and camera apps; has given up at kiosks under queue pressure | Large text, one task per screen, plain words, undo, a staff button that is always visible |
| Mei, 34, tourist from Singapore | Cannot read Korean; fluent with phones | Speak and hear her own language; translated item names; prices in KRW |
| Minsu, 45, low vision | Max font size, sometimes a screen reader | Voice replies, high contrast, screen-reader labels, respects system font size |
| Users who cannot speak easily | Hearing or speech impairment, or a noisy store | Everything also works with text input and large choice buttons |

Principle: **the user only looks at and talks to the phone; the kiosk is a mirror that confirms what changed, and the place to pay.** Details in `docs/UX.md`.

## Core features
1. **QR connect, no install.** The kiosk attract screen offers "order by talking (QR)" and "order by touch".
2. **Voice ordering with Gemini.** Natural sentences become real cart changes on the kiosk through tool calls, including complex orders.
3. **Live mirror.** Every change appears on the kiosk within ~3 s with a 2-second highlight; the phone always shows the full cart and total.
4. **Confirm before pay.** The AI can only open a confirm card; payment needs a fresh user "yes" or a tap, then a card action on the kiosk.
5. **Safe fallbacks.** Undo, choice buttons for ambiguous orders, sold-out alternatives, call-staff for questions the kiosk data cannot answer (e.g. halal), text mode when the mic is unavailable.
6. **KIBO Learn.** For kiosks with no integration, Gemini explores the kiosk UI once and writes a skill; orders are then replayed without AI (`docs/KIBO_LEARN.md`).
7. **Judge mode `/demo`.** Kiosk and assistant side by side on one screen, with example sentences and a text fallback.

## Data principle
KIBO creates no data of its own. Adapters read what the kiosk already has (menu, prices, options, sold-out state, allergens if present) and the AI answers only from that. If the kiosk has no answer (e.g. halal status), the AI does not guess; it calls staff and the kiosk shows a banner. Promotions, suggestions and AI replies never mention items that are not in the data.

## Languages
The kiosk stays in Korean; the phone speaks the user's language. That contrast is the value proposition. Supported languages are Korean and English. Since 10-13 the kiosk also has its own English mode (K1 language row, for kiosks whose data lists `en`; I-019), but it starts in Korean, so the killer scene still holds. Menu data keeps `name{ko,en}` so English speech maps to items; the kiosk locale is a setting (`ko` by default). The demo video adds English captions over the kiosk.

## Demo scenario (hero order)
1. On the laptop, `/kiosk` runs full-screen in portrait.
2. **Touch first:** the same order by touch (dine option → category → item → set → side → drink → remove pickles → second set → both fries to large → upsell → review). A tap counter and timer show in demo mode only.
3. **Then KIBO:** scan the QR; `/assistant` opens; the session connects.
4. "Two cheeseburger sets. One without pickles; drinks zero cola and cider." → two lines with different options appear on the kiosk.
5. "Make both fries large." → the two existing lines change (no new lines). The AI offers dessert once → "No, thanks."
6. The phone shows the confirm card → "Yes, pay now" → the kiosk moves to payment.
7. Virtual card payment: method → insert card → approving → approved → receipt? → order number. No real payment.
8. Compare the same final cart: **touch N taps / M s vs K utterances / T s** (measured values only).

Killer scene for the video: the kiosk supports Korean only; a tourist speaks English to their phone and the order completes.

## Covering real kiosk complexity
MALO BURGER is built as complex as a real fast-food kiosk; rules live in data and the server enforces them, so the AI does not memorize them. If an order breaks a rule, the server returns what is missing ("choose a drink: cola, zero cola, cider (+300)") and the AI asks with choice buttons.

| Real kiosk complexity | Where | How KIBO handles it |
|---|---|---|
| 7 categories, ~35 items | MALO BURGER | Whole menu in the agent instructions |
| Single / set / large set | MALO BURGER | Understands "set"; asks if not said |
| Set side and drink are required, with price deltas | MALO BURGER | Server rejects missing choices; AI asks with buttons |
| Remove / add ingredients (no pickles, extra patty +1,500) | MALO BURGER | Per-line options |
| Same item twice with different options | MALO BURGER | Separate lines |
| Upsell pop-ups | MALO BURGER | AI offers once per order (keeps operator revenue, avoids fatigue) |
| Time-limited items, sold out | MALO BURGER | Server rejects; alternatives as buttons |
| Count limits (max 3 toppings) | Doughhouse (learned) | Server validation |
| Drink customization (hot/iced, syrup, milk); shot counts not yet expressible | Gureum Darak Coffee (learned, evidence only) | Option groups learned; no orders in the demo |
| Allergens | MALO BURGER | Answer from data; otherwise call staff |
| Coupons, memberships, mobile wallets | Out of scope | Shown as "not supported" in the deck |

Proof: (1) the complex hero order, (2) a field count of screens/taps/time for the same order at two real fast-food kiosks (notes only, no photos; the simulator should be within ±20% of real taps), (3) an evaluation set grouped by complexity type (`docs/TESTING.md`).

## Kiosks in the demo
| Kiosk | Connection | Proves |
|---|---|---|
| MALO BURGER (fictional, ~35 items) | Direct adapter | Full flow, touch vs voice comparison |
| Doughhouse pizza (fictional, built by us) | KIBO Learn, voice order | No integration code needed |
| Gureum Darak Coffee (fictional, built blind by a separate agent) | KIBO Learn, evidence only | Learns a kiosk whose structure we did not know |

No real brands, logos, menu photos or store screens anywhere. Real brands appear only as plain text in the deck's market description.

## Business model
- Primary: kiosk operators and stores (B2B), monthly subscription per kiosk.
- Expansion: public institutions (B2G): community centers, stations, hospitals.
- Users pay nothing.

## Out of MVP scope
- Real payment, POS integration, coupons, memberships, mobile wallets
- Native kiosk apps (Windows/Android); KIBO Learn targets web and webview kiosks (native via OS accessibility APIs is roadmap)
- Admin dashboard, inventory management, user accounts
- Hospital and other non-food kiosks (roadmap only)

## Must keep (if time runs short, cut everything else first)
1. `/demo` on the deployed URL: MALO hero order end to end (voice; text if voice fails)
2. Confirm before pay
3. Touch vs voice measured comparison
4. One real order replayed on the learned pizza kiosk (video)

Cut order is in `docs/plan/SCHEDULE.md`.

## Design
- MALO BURGER: deep teal `#0E5E5A`, mustard `#F2B13D`, cream `#FBF7EF`; IBM Plex Sans KR + Space Grotesk.
- KIBO brand: logo in `design/brand/`.
- Details in `docs/UI_GUIDE.md`; flows in `docs/UX.md`.
