# UI Guide

## Design principles
1. **Look like a real kiosk.** Follow the familiar fast-food kiosk flow (below); our job is to make it easier, not novel.
2. **The phone is the main screen; the kiosk is the mirror.** Everything needed to order (cart, total, confirm, order number) is readable on the phone alone.
3. **Elderly-first.** If Sunja (72) can do it, everyone can. One task per screen, plain words, undo and call-staff always reachable.

Reference prototype: `design/prototype/Main.dc.html` (Claude Design). Menu photos: `design/menu/`. Logos: `design/brand/`.

**Canvas.** The kiosk is designed on a 1080×1920 portrait canvas and scaled to fit the screen (`/kiosk`, `/demo`); every kiosk size in this guide is on that canvas. The prototype draws the kiosk 596px wide (about 0.55×), so its kiosk pixel values are not the spec. Phone sizes are CSS px at 390×844.

## Kiosk flow to follow
Attract screen (language, large-text / low-screen button, "talk (QR)" and "touch") → dine-in / take-out photo cards → left category rail + photo menu grid (badges, kcal, sold out) → "Make it a set?" (single / set / large set) → side → drink → ingredients and quantity → dessert suggestion (once per order) → bottom cart bar (preview, clear all, order) → order review (quantity) → payment method → card insert and approval → receipt? → order number.

Copy follows real kiosk wording: "Make it a set?", "Insert your card below", "Print a receipt?". The kiosk starts in Korean and offers English on K1 (`src/lib/i18n/kiosk.ts`, ticket machines use ticket words); the phone uses the user's language.

## Anti-patterns (do not use)
| Avoid | Why |
|---|---|
| `backdrop-filter: blur()` glass panels | Generic AI-template look; hurts contrast for low vision |
| Gradient text, gradient orbs, neon glow animations | Decoration that reads as AI template, not kiosk |
| "Powered by AI" badges | No value to the user; say what happened instead ("Added by AI") |
| Identical `rounded-2xl` on everything | Template feel; use radius by role (phone: tiles 18px, sheets 26px; kiosk canvas: tiles 32px, sheets 48px; pills full) |
| Emoji as icons | Inconsistent rendering; use inline stroke SVG |
| Purple/indigo gradients or glows | AI cliché. KIBO blue `#3446D4` is used flat, only on the phone and the logo |

## Colors
| Use | Value |
|---|---|
| Kiosk primary (MALO teal) | `#0E5E5A` (dark `#083E3B`, tint `#DDF0EE`) |
| Kiosk accent (mustard, main action buttons) | `#F2B13D` with ink text |
| Background (cream) | `#FBF7EF`; panels `#F3EEE4`; borders `#E2DACB` |
| Ink / body / secondary | `#1E1B18` / `#33302B` / `#4B463F` |
| Warning / sold out | `#7A2E0E` on `#FFF1CC` |
| Phone primary and logo (KIBO blue) | `#3446D4` (7.06:1 on white); the rest of the phone palette is in "Phone design" |

The phone is KIBO's product: KIBO blue for the filled primary button, the mic, selection and the order number (details in "Phone design"). The kiosk is the store's: MALO teal and mustard. Cream, ink and the warning colors are shared. All text ≥ 4.5:1 contrast. Never rely on color alone: pair with text or an icon.

## Type
| Use | Style |
|---|---|
| Phone | IBM Plex Sans KR, body ≥ 20px (≥ 16px for secondary lines); scale and weights in "Phone design" |
| Kiosk text | Every character ≥ 12 mm tall on a 27" panel: **≥ 40px for all text** on the 1080×1920 canvas, checked on the rendered glyph (Korean kiosk guidance, `docs/UI_QA.md`) |
| Totals and order numbers | Space Grotesk 700; phone ≥ 32px (order number 100–140px); kiosk never below the 40px kiosk minimum |

## Components
- Touch targets ≥ 56×56px. Phone components are in "Phone design".
- Product tile (kiosk canvas): photo 272px high, name 40px bold, price 40px in teal, kcal 40px secondary color, badge top-left (BEST mustard, NEW teal), sold-out overlay with text.
- Bottom sheet for set steps: step label ("Step 2 of 4 · set"), photo options in a 3-column grid, selected = 6px teal border + tint ring (kiosk canvas).
- AI change: kiosk tile and cart chip get a teal 6–8px ring (kiosk canvas) for 2 s plus a status line "Added by AI: …".
- Staff: the kiosk shows a banner when called (the phone's staff button is in "Phone design").

## Phone design
Decided 10-13 (12-phone-app:0), after the user found the phone "clunky": calm, airy and app-like, with the clarity of a modern Korean finance or mobility app, but KIBO's own look (KIBO blue, cream, IBM Plex Sans KR, Space Grotesk for numbers). The elderly-first numbers do not move: body ≥ 20px, secondary ≥ 16px, targets ≥ 56px (primary ≥ 60px, mic and [Yes, pay now] 88px), text ≥ 4.5:1, focus always visible, color never alone. Components: `src/components/phone/`; class strings: `src/components/phone/ui.ts`; tokens: the phone `@theme` block in `src/app/globals.css`; preview with sample data: `/design/phone` (development only, 404 in production; `e2e/qa/design.qa.spec.ts`).

**Palette** (Tailwind names from `globals.css`)
| Token | Value | Use |
|---|---|---|
| `kibo` / `kibo-pressed` | `#3446D4` / `#2735A8` | the one filled primary per screen, the mic, the order number |
| `kibo-tint` / `kibo-tint-pressed` | `#EEF0FD` / `#DDE1FA` | secondary buttons, suggestions, the mic when it steps back; blue text on it 6.2:1 |
| `kibo-bubble` | `#DFE3FB` | the user's own bubble (deeper than suggestions) |
| `kibo-deep` | `#1F2A8A` | text on the tint (suggestions, status pills) |
| `ink` / `muted` | `#15171C` / `#4B463F` | text / secondary text |
| `cream` | `#FBF7EF` | page; white cards sit on it |
| `field` | `#7D766B` | the 1px edge of a text field, 4.5:1 on white (WCAG 1.4.11) |
| `staff-tint` / `staff-ink` | `#FFF1CC` / `#7A2E0E` | the staff button and warnings (the shared warning pair) |
| `online` | `#1E7F4F` | the connection dot, always next to the word "Connected" |

**Surfaces and elevation.** Cream page; white cards with `shadow-card` (two layers, 6% ink: `0 1px 2px` and `0 4px 16px`) and no border; the bottom dock and the P4 bar are white sheets with `shadow-dock` and a 26px top radius. A hairline (`line`, 1px) only separates rows inside a white card. **No 2px dark outlines anywhere**; the only dark edge is the 3px focus ring (`outline` ink, offset 2px). On `/demo` the KIBO side follows the same rules (12-phone-app:1): the phone frame is a 26px card with `shadow-card`; the scenario guide is a cream column with white scenario cards, `kibo-tint` tags and sentence chips; [Scenarios] and "What the AI did" are white with `shadow-card`. The kiosk half keeps its own look, because it stands for an existing third-party kiosk.

**Radius.** `rounded-tile` 18px (buttons, bubbles, suggestions, fields), `rounded-sheet` 26px (cards, dock), pills `rounded-full`, cart thumbnails 12px.

**Buttons.** One filled primary per screen (I-142).
| Kind | Look |
|---|---|
| Primary | filled `kibo`, white 20px/700 text, full width, ≥ 60px (88px for [Yes, pay now]) |
| Secondary | `kibo-tint` with `kibo` 20px/600 text, no border, full width, ≥ 60px ([Pick more]) |
| Quiet | text button with an icon, `kibo` 20px/600, tint only while pressed, ≥ 56px ([Undo]) |
| Staff | `staff-tint` with `staff-ink`, bell icon over "Staff" / "직원", ≥ 56px; its accessible name is "Call staff" |
| Compact | icon over a 16px/600 label, ≥ 56×56px (app bar and dock side controls) |
Every button has pressed (color, and a 0.98 shrink only without reduced motion), disabled (60% opacity) and focus states.

**Icons.** `lucide-react` (ISC license), 24px, stroke 2, round caps and joins, always with a text label (mic 32px). Hand-drawn pictures (P5 card into the kiosk) use the same stroke style.

**Type.** At most 4 sizes per screen: 16 / 20 / 24 / 32px; the order number (120px) does not count. Numbers (totals, prices, order number) in Space Grotesk 700 with tabular figures where they line up. Weights: titles 700, labels and line names 600, body 400. Body line height 1.5.

**App bar** (every phone screen). One row, 64px, white with `shadow-card`: the KIBO mark (32px), the kiosk brand (16px/700) over a dot and a word ("Connected" / "Reconnecting…", 16px muted; the dot is never the only signal), then the language button (globe over the other language's full name, "한국어" / "English": a short code like "EN" would not be part of its accessible name, WCAG 2.5.3), then the staff button. No visible borders.

**Conversation.** User bubble right in `kibo-bubble` with ink text; AI bubble left, white with `shadow-card`; both 20px with one squared corner toward the speaker; notices full width in `staff-tint`. Only the last two messages are large; older ones are 16px behind "Earlier messages". State pills ("Listening…", "Working…", "Reconnecting…") are small 16px/600 pills centred above the dock, white with `shadow-card` (warnings in `staff-tint`).

**Cart card.** Header "Your order · 2 items" (title 20px/700, count 400 muted; the count is the sum of quantities) with a quiet [Undo]. Rows: 48px thumbnail (none on a learned kiosk, I-103), name 20px/600 on one or two lines, options 16px muted, price right-aligned 20px/600 with a 16px quantity pill under it. Total row under a hairline: "Total" 20px/600 and the amount 32px Space Grotesk.

**Suggestions.** "Try saying" (16px/600 muted) over soft `kibo-tint` cards with a speech-bubble icon, 20px `kibo-deep` text (the phone body size, not 18px), no border; a tap sends the sentence.

**Bottom dock** (P3). A white sheet, ≤ 150px tall at 390×844: an 88px round mic in the middle with what a tap does under it ("Tap to talk"; "Tap to cancel" while connecting or reconnecting; "Tap to end voice" while listening, thinking or speaking), its state named first for screen readers; on the left a 56px [Type] (keyboard icon) that opens the text field and [Send] above the row (200ms rise) and becomes [Close]; on the right a 56px AI voice switch (speaker icon over "Voice on" / "Voice off", named "AI voice"). The mic is filled blue at rest, white with a 3px blue ring while voice runs (plus the listening pulse), and tinted while the text field is open, so [Send] is the one filled button. What is happening shows as a pill above the dock ("Listening…", "Working…", the `/demo` voice timer); why voice stopped, or the noise hint, is one warning line at the top of the dock. The text field stays open for the rest of the order once opened (by [Type], [Type instead] on P1, or voice giving way to text) until [Close]; `/demo` opens it at the start, because a judge on a laptop usually types. After the `/demo` message limit, the limit line and [Try again] take its place.

**Confirm (P4).** The scrolling part: a white card with "Please check your order" (24px/700), the dine option (20px muted) and the lines, then [Pick more] (secondary). The fixed bottom sheet: the total (32px), [Yes, pay now] (88px, filled) and a row of [Type] and a tinted mic pill (88px, "Tap to talk" over "You can also say yes."), so the total and the button are always fully visible (I-134). An open text field sits above that row with a tinted [Send], so [Yes, pay now] stays the only filled button. On a learned kiosk there is no bottom sheet: the total is in the card, the kiosk's own checkout hint sits between the card and [Pick more], and the dock stays.

**Pay (P5).** One white card: the stroke picture of a card going into the kiosk (points right, mirrored on `/demo`), "Insert your card into the kiosk" (24px/700), the kiosk's own card button in the hint, and the total.

**Done (P6).** One white card: "Order number" (20px/600 muted), the number 120px Space Grotesk in KIBO blue with proportional figures and 0.04em tracking (the tabular "1" has a foot, and a 7 and a 1 touched), "We'll call your number at the counter."; [Done] (primary) under the card (on `/demo` the end card instead).

**Home (P0, `/app`).** No app bar (there is no kiosk yet): the KIBO logo (40px), one 24px line, [Continue my order] (secondary) only while this phone holds an open order, then the pairing card (12-phone-app:3, the primary way in): "Enter the 6-digit code shown on the kiosk" (20px/600), a 72px numeric field with 32px Space Grotesk digits spaced 0.3em and a 1px `field` edge, the error under it in `staff-ink` 20px, and [Connect] (primary, 88px, link icon); then "Or connect with the QR" (16px muted) over [Scan a kiosk] (secondary, scan icon); then two white cards: "How it works" (three numbered steps on `kibo-tint` circles) and "Settings": the language as two halves on a tint track (the chosen one white with a check mark), and full-width switch rows for AI voice and larger text (name left; "On"/"Off" in words and a 56×32 track right, `kibo` on, `field` off). Larger text sets the root font size to 115%, so every rem size grows and the browser's own text size still applies.

**Scanner (`/app/scan`).** [Back] (quiet) and the 24px title; first the camera hint like the microphone hint (a white card picturing the browser's prompt with [Allow] ringed, "Tap **Allow** on the next screen.", [Turn on the camera] primary 88px); then the camera, square, 26px radius, with a white 4px framing square and the outside dimmed, "Point at the QR on the kiosk" (20px) under it, a `staff-tint` line for a QR that is not a KIBO kiosk, and [Light on] (secondary small) only when the camera has a torch. Without a camera: a white card ("The camera isn't available." and what to do instead), a link field with [Open] (primary) and [Turn on the camera] (secondary).

**Kiosk pairing line (K1, QR sheet).** Under the QR, a white 32px-radius panel: "또는 휴대폰에서 이 주소를 열고", the host and `/app` bold in the kiosk's dark primary (breaks anywhere when long), "이 번호를 넣으세요", and on the right "연결 번호" over the code in 72px Space Grotesk as "123 456" (screen readers hear the digits one by one). Kiosk canvas sizes, all ≥ 40px.

**Motion.** Sheets open in 200ms ease-out (`kibo-sheet-in`; a plain fade with reduced motion); presses change color in 150ms; the listening pulse is unchanged. Nothing else moves.

## Motion
- Only state feedback: 2 s highlight fade, card-insert slide (0.5 s), listening pulse; on the phone also the 200ms sheet rise and 150ms press feedback ("Phone design"). No decorative animation.

## Accessibility
- Every control is a real `<button>`/`<a>`/`<input>` with a label; icon-only buttons get `aria-label`.
- Cart changes announced with `aria-live` when AI voice is off; suppressed while AI is speaking.
- While a sheet or dialog is open, the rest of the screen is `inert`, so focus never lands under the scrim (kiosk: `ModalLayer`).
- Respect system font size; no text in images.
