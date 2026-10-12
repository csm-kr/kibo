# UI Guide

## Design principles
1. **Look like a real kiosk.** Follow the familiar fast-food kiosk flow (below); our job is to make it easier, not novel.
2. **The phone is the main screen; the kiosk is the mirror.** Everything needed to order (cart, total, confirm, order number) is readable on the phone alone.
3. **Elderly-first.** If Sunja (72) can do it, everyone can. One task per screen, plain words, undo and call-staff always reachable.

Reference prototype: `design/prototype/Main.dc.html` (Claude Design). Menu photos: `design/menu/`. Logos: `design/brand/`.

**Canvas.** The kiosk is designed on a 1080×1920 portrait canvas and scaled to fit the screen (`/kiosk`, `/demo`); every kiosk size in this guide is on that canvas. The prototype draws the kiosk 596px wide (about 0.55×), so its kiosk pixel values are not the spec. Phone sizes are CSS px at 390×844.

## Kiosk flow to follow
Attract screen (language, large-text / low-screen button, "talk (QR)" and "touch") → dine-in / take-out photo cards → left category rail + photo menu grid (badges, kcal, sold out) → "Make it a set?" (single / set / large set) → side → drink → ingredients and quantity → dessert suggestion (once per order) → bottom cart bar (preview, clear all, order) → order review (quantity) → payment method → card insert and approval → receipt? → order number.

Copy follows real kiosk wording: "Make it a set?", "Insert your card below", "Print a receipt?". Korean UI on the kiosk; the phone uses the user's language.

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
| Phone primary and logo (KIBO blue) | `#3446D4` (7.06:1 on white), ink `#15171C` |

The phone is KIBO's product: KIBO blue for primary buttons, the mic, selection borders and the order number. The kiosk is the store's: MALO teal and mustard. Cream, ink and the warning colors are shared. All text ≥ 4.5:1 contrast. Never rely on color alone: pair with text or an icon.

## Type
| Use | Style |
|---|---|
| Body (phone) | IBM Plex Sans KR, ≥ 20px (≥ 16px for secondary lines) |
| Kiosk text | Every character ≥ 12 mm tall on a 27" panel: **≥ 40px for all text** on the 1080×1920 canvas, checked on the rendered glyph (Korean kiosk guidance, `docs/UI_QA.md`) |
| Totals and order numbers | Space Grotesk 700; phone ≥ 32px (order number 100–140px); kiosk never below the 40px kiosk minimum |

## Components
- Touch targets ≥ 56×56px; primary buttons full width on the phone.
- Product tile (kiosk canvas): photo 272px high, name 40px bold, price 40px in teal, kcal 40px secondary color, badge top-left (BEST mustard, NEW teal), sold-out overlay with text.
- Bottom sheet for set steps: step label ("Step 2 of 4 · set"), photo options in a 3-column grid, selected = 6px teal border + tint ring (kiosk canvas).
- AI change: kiosk tile and cart chip get a teal 6–8px ring (kiosk canvas) for 2 s plus a status line "Added by AI: …".
- Staff button: always visible on the phone header; kiosk shows a banner when called.

## Motion
- Only state feedback: 2 s highlight fade, card-insert slide (0.5 s), listening pulse. No decorative animation.

## Accessibility
- Every control is a real `<button>`/`<a>`/`<input>` with a label; icon-only buttons get `aria-label`.
- Cart changes announced with `aria-live` when AI voice is off; suppressed while AI is speaking.
- While a sheet or dialog is open, the rest of the screen is `inert`, so focus never lands under the scrim (kiosk: `ModalLayer`).
- Respect system font size; no text in images.
