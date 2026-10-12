# PRD: KIBO (Kiosk Intelligence Bridge & Operator)

## Goal
Let anyone order at an existing self-order kiosk by talking to their own phone, without replacing the kiosk.

## Users
| Persona | Situation | What the design must give them |
|---|---|---|
| Sunja, 72, Korean (primary) | Uses chat and camera apps; has given up at kiosks under queue pressure | Large text, one task per screen, plain words, undo, a staff button that is always visible |
| Mei, 34, tourist from Singapore | Cannot read Korean; fluent with phones | Speak and hear her own language; translated item names; prices in KRW |
| Minsu, 45, low vision | Max font size, sometimes a screen reader | Voice replies, high contrast, screen-reader labels, respects system font size |
| Users who cannot speak easily | Hearing or speech impairment, or a noisy store | Everything also works with text input and large choice buttons |

Principle: **the user only looks at and talks to the phone; the kiosk is a mirror that confirms what changed, and the place to pay.**

## Core features
1. **QR connect, no install.** The kiosk standby screen shows "order by talking (QR)" and "order by touch".
2. **Voice ordering with Gemini.** Natural sentences become real cart changes on the kiosk (tool calls), including complex orders: two of the same set with different options, set side/drink choices, ingredient removal, edits to existing lines.
3. **Live mirror.** Every change appears on the kiosk within ~3 s with a 2-second highlight; the phone always shows the full cart and total.
4. **Confirm before pay.** The AI can only open a confirm card; payment needs a fresh user "yes" or a tap, then a card action on the kiosk.
5. **Safe fallbacks.** Undo, choice buttons for ambiguous orders, sold-out alternatives, call-staff for questions the kiosk data cannot answer (e.g. halal), text mode when the mic is unavailable.
6. **KIBO Learn.** For kiosks with no integration, Gemini explores the kiosk UI once, writes a skill (catalog + click recipes), self-tests it, and orders are then replayed without AI.
7. **Judge mode `/demo`.** Kiosk and assistant side by side on one screen, with example sentences and a text fallback.

## Success criterion (demo)
Saying "one cheeseburger set, Coke Zero" to a phone makes the kiosk on the laptop change by itself, with no further manual input, and the real order state changes. Text-only output from the AI is a failure.

## Out of MVP scope
- Real payment, POS integration, coupons, memberships, mobile wallets (shown as "not supported" in the deck)
- Native kiosk apps (Windows/Android); KIBO Learn targets web and webview kiosks
- Admin dashboard, inventory management, user accounts
- Hospital and other non-food kiosks (roadmap only)

## Kiosks in the demo
| Kiosk | Connection | Proves |
|---|---|---|
| MALO BURGER (fictional, ~35 items) | Direct adapter | Full flow, touch vs voice comparison |
| Doughhouse pizza (fictional) | KIBO Learn | No integration code needed |
| Gureum Darak Coffee (fictional, built blind by a separate agent) | KIBO Learn, evidence only | Learns a kiosk whose structure we did not know |

No real brands, logos, menu photos or store screens anywhere.

## Design
- MALO BURGER: deep teal `#0E5E5A`, mustard `#F2B13D`, cream `#FBF7EF`; IBM Plex Sans KR + Space Grotesk.
- KIBO brand: logo in `design/brand/`.
- Details in `docs/UI_GUIDE.md`.
