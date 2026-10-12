# UI Guide

## Design principles
1. **Look like a real kiosk.** Follow the familiar fast-food kiosk flow (below); our job is to make it easier, not novel.
2. **The phone is the main screen; the kiosk is the mirror.** Everything needed to order (cart, total, confirm, order number) is readable on the phone alone.
3. **Elderly-first.** If Sunja (72) can do it, everyone can. One task per screen, plain words, undo and call-staff always reachable.

Reference prototype: `design/prototype/Main.dc.html` (Claude Design). Menu photos: `design/menu/`. Logos: `design/brand/`.

## Kiosk flow to follow
Attract screen (language, large-text / low-screen button, "talk (QR)" and "touch") → dine-in / take-out photo cards → left category rail + photo menu grid (badges, kcal, sold out) → "Make it a set?" (single / set / large set) → side → drink → ingredients and quantity → dessert suggestion (once per order) → bottom cart bar (preview, clear all, order) → order review (quantity) → payment method → card insert and approval → receipt? → order number.

Copy follows real kiosk wording: "Make it a set?", "Insert your card below", "Print a receipt?". Korean UI on the kiosk; the phone uses the user's language.

## Anti-patterns (do not use)
| Avoid | Why |
|---|---|
| `backdrop-filter: blur()` glass panels | Generic AI-template look; hurts contrast for low vision |
| Gradient text, gradient orbs, neon glow animations | Decoration that reads as AI template, not kiosk |
| "Powered by AI" badges | No value to the user; say what happened instead ("Added by AI") |
| Identical `rounded-2xl` on everything | Template feel; use radius by role (tiles 18px, sheets 26px, pills full) |
| Emoji as icons | Inconsistent rendering; use inline stroke SVG |
| Purple/indigo as the product UI color | AI cliché. Exception: the KIBO logo mark uses `#3446D4`; kiosk and phone UI use the MALO palette |

## Colors
| Use | Value |
|---|---|
| Primary (MALO teal) | `#0E5E5A` (dark `#083E3B`, tint `#DDF0EE`) |
| Accent (mustard, main action buttons) | `#F2B13D` with ink text |
| Background (cream) | `#FBF7EF`; panels `#F3EEE4`; borders `#E2DACB` |
| Ink / body / secondary | `#1E1B18` / `#33302B` / `#4B463F` |
| Warning / sold out | `#7A2E0E` on `#FFF1CC` |
| KIBO brand (logo only) | `#3446D4`, ink `#15171C` |
All text ≥ 4.5:1 contrast. Never rely on color alone: pair with text or an icon.

## Type
| Use | Style |
|---|---|
| Body (phone) | IBM Plex Sans KR, ≥ 20px (≥ 16px for secondary lines) |
| Body (kiosk) | ≥ 28px for primary text, ≥ 20px for secondary |
| Totals and order numbers | Space Grotesk 700, ≥ 32px (order number 100–140px) |

## Components
- Touch targets ≥ 56×56px; primary buttons full width on the phone.
- Product tile: photo 150px high, name 21px bold, price in teal, kcal secondary, badge top-left (BEST mustard, NEW teal), sold-out overlay with text.
- Bottom sheet for set steps: step label ("Step 2 · set"), photo options in a 3-column grid, selected = 3px teal border + tint ring.
- AI change: kiosk tile and cart chip get a teal 3–4px ring for 2 s plus a status line "Added by AI: …".
- Staff button: always visible on the phone header; kiosk shows a banner when called.

## Motion
- Only state feedback: 2 s highlight fade, card-insert slide (0.5 s), listening pulse. No decorative animation.

## Accessibility
- Every control is a real `<button>`/`<a>`/`<input>` with a label; icon-only buttons get `aria-label`.
- Cart changes announced with `aria-live` when AI voice is off; suppressed while AI is speaking.
- Respect system font size; no text in images.
