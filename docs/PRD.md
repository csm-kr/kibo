# PRD: KIBO (Kiosk Intelligence Bridge & Operator)

## Goal
Let anyone order at an existing self-order kiosk by talking to their own phone, without replacing the kiosk.

One-line pitch: **"Don't learn the kiosk. Just talk."** Say one thing to your phone and the kiosk on the counter moves by itself until the order is done. Kiosks with no integration are connected by KIBO Learn.

## Problem
Every number below is from `docs/plan/SOURCES.md` (ids in brackets); quote it only with its source line.
- Self-order kiosks are everywhere, but older adults, people with low vision or speech/hearing difficulties, and visitors who cannot read Korean get stuck: many screens, small text, set/side/drink sub-steps, upsell pop-ups, time pressure from the queue. Older users' top complaints: too many steps (51.4%), cannot find the next button (51.0%), pressure from the people waiting (49.0%) (Korea Consumer Agency, 2020, 245 kiosk users aged 65+ in Seoul; S10).
- **17.9% of Koreans aged 65+ say they can order or check in at a kiosk**, 8.3% at 75–79 (KIHASA, 2024; S16), while **76.6% own a smartphone** (MOHW, 2024; S15). Ownership is not ability, so we never say "76.6% can use KIBO".
- 206 of the 233 people who had trouble at a kiosk in the past year had given up an order midway (Korea Consumer Agency, 2022, 500 people of all ages; S11).
- 18,936,562 visitors came to Korea in 2025; language was the lowest-rated part of the trip, 79.3% satisfied (MCST and KCTI, 2026; S23). 245,361 Koreans are registered as visually disabled, 59.1% of them aged 65+ (MOHW, 2025; S25).
- Adding voice ordering to the kiosk itself means new hardware (mic, speaker) and software at every unit; about 466 verified barrier-free kiosks had been sold by 2025 (MOHW estimate; S9).
- **Law (Korea), two separate statutes.** (1) The Digital Inclusion Act, in force 2026-01-22, asks every kiosk operator to take one of five measures for people who struggle with digital devices, older people included; measure 5 is a website or mobile app that assists kiosk use, counted only if it gives equal access and use (Enforcement Decree Art. 15; S6). Kiosks installed on or before 2025-03-26 were due by 2026-01-28 (S7); the 2027-01-22 date is for small manufacturers and lessors, not operators (S8). (2) The Disability Anti-Discrimination Act requires reasonable accommodation at kiosks (Art. 15; S1); existing kiosks are covered from 2026-01-28 (S2, S5). Its decree, amended 2025-11-18, lets small sites (under 50 m², small businesses, small table-order devices) instead install compatible assistive devices or software, or assign staff and a call bell (S3); MOHW names a QR- or NFC-connected app or web page that gives a smartphone access to the kiosk as an example of such software (S4). Fine path for both: up to KRW 30 million after an ignored correction order (S4, S6).
- **What KIBO is under these laws:** a type of measure the decrees list (an assisting app, compatible software). KIBO does **not** make a shop compliant and has no certification; equal access is judged case by case. It still helps because it works on the kiosks already installed: no replacement, no new hardware, and it adds voice, language and large-text access that a call bell does not. A disability group reportedly filed a constitutional complaint against the 2025 decree change; the outcome was not confirmed (SOURCES.md, last note).

## Why the phone
- Most people already carry the mic, speaker, compute and personal settings (language, font size, screen reader); 76.6% of Koreans aged 65+ own a smartphone (S15). The kiosk only needs to show a QR and accept commands, which is software.
- **Learn once, use everywhere.** The same phone and the same way of speaking work at every kiosk; users never relearn each kiosk's UI.
- No app install: scan the QR, a web page opens. The first time needs one microphone permission; the UI shows a large hint before the browser prompt.

## Why not something else (landing "Why not …?")
Never "first" or "only". Each line says what KIBO does differently.
| Alternative | What KIBO does differently |
|---|---|
| Replace the kiosk with a barrier-free one (about 466 verified units sold by 2025, S9) | Works on the kiosk already there; nothing replaced |
| The shop's own app or QR ordering | One phone and one way of talking for every kiosk; the order fills the kiosk in front of you |
| A voice kiosk (mic and voice software added to each kiosk) | Own phone and own language; no kiosk hardware |
| Gemini Live with the camera on the kiosk | It can describe the screen; KIBO changes the kiosk's own cart through server-checked actions |
| The phone as a remote touchpad (QR remote control) | You say the order instead of moving through every screen |
| Phone-call kiosk support: a Korean company's patent registered 2026-03 (QR scan + phone call, speech turned into touch commands; S30) | Closest idea. KIBO adds: the AI cannot pay (server-enforced), and KIBO Learn learns a web kiosk once and replays without AI with the kiosk's total verified |

**How KIBO gets onto a kiosk:** a direct adapter for kiosks that share menu data; on web kiosks one script added by the vendor or store (script tag, kiosk-browser extension, WebView injection); native apps are roadmap. No vendor or store partnerships yet.

**No smartphone, or won't talk in a queue:** KIBO is optional. The kiosk keeps touch and its large-text, lower-screen mode, and staff as today; a phone without a camera app types the 6-digit code; anyone can type or tap instead of talking.

**Privacy (landing "Your data"):** no account; KIBO stores no audio, conversation or personal data; the order session expires after 10 minutes without activity (`SESSION_TTL_MS`) and Firestore deletes it by TTL. Speech and text are processed by Google Gemini under Google's terms. The check behind this line is in `docs/SECURITY.md` "Privacy line".

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
The kiosk stays in Korean; the phone speaks the user's language. That contrast is the value proposition. The phone's screens are Korean or English; since 14-final:4 its AI also speaks and writes Japanese, Chinese (Simplified), Spanish, Vietnamese, French, Thai and Indonesian (picker in the app bar; screens stay English, item names stay as the kiosk has them). Those seven are tested by typing (`evals/results/`, `evidence/live-languages.json`); speaking them is not tested yet, so public material names this list and never "99 languages" (`docs/plan/SOURCES.md` G1, G1b). Since 10-13 the kiosk also has its own English mode (K1 language row, for kiosks whose data lists `en`; I-019), but it starts in Korean, so the killer scene still holds. Menu data keeps `name{ko,en}` so English speech maps to items; the kiosk locale is a setting (`ko` by default). The demo video adds English captions over the kiosk.

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
| SKYLINE AIRPORT RAIL (fictional ticket machine, 11 tickets and passes) | Direct adapter | The same phone works at a different kind of place: tickets, passenger fares, no dine question (Mei's journey) |
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
