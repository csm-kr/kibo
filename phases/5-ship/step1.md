# Step 1: landing

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: PRD (Goal, Problem, Why the phone, Users, Core features, Data principle), ADR-005 (confirm before pay), UI_GUIDE (KIBO blue on KIBO's own surfaces, anti-patterns), UI_QA (phone/desktop text and target rules), RULE R-001, TESTING "Evidence ledger".
- `docs/plan/STRATEGY.md` is not in your prompt; read it: what judges look for (technical depth, impact, innovation, UX) and the rubric words to echo ("Accessibility", "integration with existing systems", "scalability").
- Code: `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `public/kibo-logo.svg`, `public/kibo-mark.svg`, `src/app/demo/page.tsx`, `e2e/qa/*`, `playwright.qa.config.ts`, `evidence/*`, `evals/results/*.md`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
The root page `/` is the first thing a judge sees after the video. In 20 seconds it must say what KIBO is, prove it is real, and send them to `/demo`. English only.

### Real screenshots: `scripts/landing-shots.ts` (`npm run shots:landing`, Playwright, `STORE=memory` dev server)
Capture real product screens (never mockups): the phone talk screen with a two-line cart (390×844), the kiosk menu with the AI highlight (1080×1920, saved scaled to 540×960), the phone confirm card, and `/demo` at 1440×900 mid-order. Drive state through the API as the E2E tests do (no model calls). Save as optimized `.webp` or `.png` (each < 300 KB) in `public/landing/`. Commit them.

### `src/app/page.tsx` (server component; small client parts only if needed)
Sections, in this order, each short:
1. **Hero:** KIBO logo, "Don't learn the kiosk. Just talk.", one sentence ("Say your order to your own phone; the self-order kiosk in front of you fills itself. No new hardware, no app to install."), primary [Try the live demo] → `/demo` (KIBO blue, ≥ 56px), secondary [Two-device mode] → `/kiosk`. Next to it the `/demo` screenshot.
2. **Who it is for:** three short cards from the PRD personas (an older first-time user, a visitor who cannot read Korean, a person with low vision or who cannot speak easily), each one line on what KIBO gives them. No invented statistics; if you state a fact about kiosks or law, it must be marked unverified or cite its source (R-001). Prefer no numbers here.
3. **How it works:** three numbered steps with the real screenshots: scan the QR → talk or type → confirm on your phone, pay at the kiosk.
4. **Safe by design:** "The AI can fill the cart, but it cannot pay": confirm card, a fresh "yes" or a tap, card payment only on the kiosk; server-side validation of every AI action; names and prices only from the kiosk's own data; staff is called for anything the data cannot answer.
5. **Works with kiosks that exist:** direct adapter (MALO BURGER simulator) and KIBO Learn (learns a kiosk's screens once, then replays orders without AI). Numbers only from the evidence ledger, each with its file path in small text (for example the measured replay time and its log path, or the agent eval pass rate and its result file). If a number is not in the ledger as measured, leave it out.
6. **Built on Google Cloud:** an inline SVG architecture diagram (phone, kiosk, Cloud Run, Firestore, Gemini Live, Gemini Flash, Secret Manager; arrows with labels matching ARCHITECTURE "Deployment") and one line per service on what it does in KIBO.
7. **Accessibility:** large text, ≥ 56px targets, screen-reader labels and live announcements, text mode when the mic is unavailable, call-staff always visible, Korean and English.
8. **Footer:** "MALO BURGER, Doughhouse and Gureum Darak Coffee are fictional brands made for this demo. Menu photos are AI-generated." Team name "malo", and the contest name. No pricing, no sales pitch (T&C: no advertisements).
Layout: one column on phones, two columns where useful from 1024px; body ≥ 18px on desktop and ≥ 20px on phones, links and buttons ≥ 56px tall; KIBO blue for primary actions only; cream background; no glass blur, gradient text, neon, emoji icons, or "Powered by AI".
Metadata: title "KIBO — talk to any kiosk", description, Open Graph image (the `/demo` screenshot).

### UI QA
Add `e2e/qa/landing.qa.spec.ts`: `/` at 1440×900, 1280×720, 390×844 and 320 wide.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run qa:ui
```

## Verify
1. Run the AC commands; fix H failures on `/`.
2. Read the page as a cold judge: is it clear in 20 seconds what KIBO does and where to click? Every number has its evidence path.
3. Update this step in `phases/5-ship/index.json` (completed + summary / error / blocked).

## Do not
- Do not use mockups or fake screenshots; only captures of the running app.
- Do not claim legal compliance (PRD: KIBO does not satisfy the barrier-free law).
- Do not mention OpenAI anywhere on the page (the product uses Gemini only; ADR-008).
- Break existing tests.
