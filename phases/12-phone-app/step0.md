# Step 0: phone-design

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. UI_GUIDE (all), UI_QA (phone rows of "KIBO numbers" and "Visual standard", "Visual heuristics"), UX (Screen map P1–P7, PX; Accessibility), USER_JOURNEY J1–J3.
- Current phone screens: `phases/9-polish/qa/assistant-*-390x844.png` and `-360x800.png` (look at all of them), `src/components/assistant/*`, `src/app/assistant/*`, `src/app/globals.css`, `src/lib/i18n/phone.ts`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
The user (10-13): "the phone web part looks clunky; make it cleaner." The phone is KIBO's own product surface and what judges hold in their hand. The orchestrating session's look at the current screens found:
- **Heavy 2px black outlines everywhere** (header language and staff buttons, [Undo], the AI voice box, [Pick more], the dine photo cards, the text input): it reads like a form, not an app.
- **A crowded bottom**: the mic pill, the AI voice box, the text input and [Send] are all visible at once (about 200px).
- **Example sentences look like input fields** (blue-outlined boxes, small text).
- **Weak hierarchy**: nearly every text is bold and close in size; the cart's "× 1" floats; long names wrap awkwardly.
This step writes the design and the tokens; the next step implements them. **No product screens change in this step** except a design preview route (below).

## Task
1. **Direction:** calm, airy, app-like; clarity of a modern Korean finance or mobility app, but KIBO's own identity (KIBO blue `#3446D4`, cream background, IBM Plex Sans KR + Space Grotesk for numbers). Elderly-first rules stay: body ≥ 20px, secondary ≥ 16px, targets ≥ 56px (primary ≥ 60px, mic and pay ≥ 88px), contrast ≥ 4.5:1, focus always visible, color never alone. No glass blur, gradients, neon, emoji icons or "Powered by AI" (UI_GUIDE anti-patterns).
2. **Write "Phone design" in `docs/UI_GUIDE.md`** (replace the phone parts of "Colors", "Type" and "Components" that it supersedes; keep the kiosk parts untouched; R-002 for UI_QA numbers if any change):
   - **Surfaces and elevation:** cream page, white cards with a soft shadow (two layers, low opacity) and a hairline border only where cards sit on white; no 2px dark outlines anywhere except the focus ring.
   - **Buttons:** primary = filled KIBO blue; secondary = tinted (KIBO blue at ~8–10%) with blue text, no border; quiet = text button with icon; staff = warm tint (amber family, AA text) with a bell icon; one filled primary per screen (I-142).
   - **Icons:** one consistent stroke icon set (`lucide-react`, ISC license) at 24px with labels; replace hand-drawn SVGs where they differ in style.
   - **Type scale:** 4 sizes max per screen (e.g. 16 / 20 / 24 / 32, numbers in Space Grotesk), weights 400/600/700 with a clear rule for each (titles 700, labels 600, body 400).
   - **App bar (all phone screens):** one row, 64px: kiosk brand (small mark + name) with a connection dot **and text** ("Connected"), language button (globe + "EN"/"한"), staff button (bell + "Staff"/"직원"), all ≥ 56px hit areas without visible heavy borders.
   - **Conversation:** user bubble (KIBO blue tint, right), AI bubble (white card, left, 20px), only the last two visible large; status chips ("Listening…", "Working…") as small pills above the dock.
   - **Cart card:** header "Your order · 2 items" + quiet [Undo]; rows with 48px thumbnail, name 20px/600 on one or two lines, options 16px muted, a qty pill and the price right-aligned in tabular figures; total row 32px Space Grotesk.
   - **Suggestions:** "Try saying" as soft tinted cards with a speech-bubble icon, 18px text, no border; tap sends.
   - **Bottom dock:** a single 88px round mic button centered with its state label under it; left a 56px keyboard button that opens the text input sheet (input + Send appear only then); right a 56px AI-voice toggle (speaker icon + "On/Off"). The dock is ≤ 150px tall at 390×844.
   - **Confirm (P4) / Pay (P5) / Done (P6):** focused layouts: P4 total 32px, [Yes, pay now] 88px filled, [Pick more] secondary tinted; P5 a clean illustration (stroke style matching the icon set) of "card into the kiosk"; P6 the order number 120px in KIBO blue on a white card with "We'll call your number".
   - **Motion:** 150–250ms ease-out for sheet open/close and button press; listening pulse unchanged; reduced motion honored.
3. **Tokens:** add the phone tokens to `src/app/globals.css` (`@theme` colors for tints, shadow utilities, radius 18/26, spacing on the 4/8 scale) without changing kiosk tokens.
4. **Preview:** a dev-only route `/design/phone` (404 in production) that renders the new components in isolation with sample data (app bar, bubbles, cart card, suggestions, dock in each state, confirm, done), so the next step and QA can screenshot them. Add it to the QA suite at 390×844 and 360×800.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run qa:ui
```

## Verify
1. Look at the `/design/phone` screenshots next to the old P3/P4 screenshots: is it calmer and clearer while every rule still holds?
2. Update this step in `phases/12-phone-app/index.json` (completed + summary / error / blocked).

## Do not
- Do not change the kiosk look or tokens.
- Do not shrink text or targets below the rules to "look cleaner".
- Do not wire the new components into `/assistant` yet (next step).
