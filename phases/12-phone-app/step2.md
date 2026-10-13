# Step 2: pwa-shell

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: PRD "Why the phone" (learn once, use everywhere; no app install needed), UX "Screen map" P1–P7, "Accessibility" (system font size, voice replies can be turned off, Korean and English), UI_GUIDE (phone: KIBO blue `#3446D4`, cream, type sizes, targets), UI_QA (phone rows).
- `AGENTS.md`, then the Next.js 16.4 guides in `node_modules/next/dist/docs/` for the app manifest (`app/manifest.ts`), icons, metadata/viewport, and service workers/PWA.
- The phone design spec and redesign from steps 0–1 (UI_GUIDE "Phone design", `src/components/assistant/*`, the shared phone tokens): `/app` must use the same components and tokens.
- Code: `src/app/assistant/*`, `src/components/assistant/*`, `src/lib/phone/*`, `src/lib/i18n/phone.ts`, `public/kibo-logo.svg`, `public/kibo-mark.svg`, `src/app/layout.tsx`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
The user (10-13) wants the phone side to feel like a real app: open KIBO from the home screen, scan the kiosk's QR with the camera inside the app, and talk. Scanning with the phone's own camera app and opening the link must keep working with no install (PRD).

## Task
1. **Installable web app:** `src/app/manifest.ts` (name "KIBO", short_name "KIBO", start_url `/app`, scope `/`, display `standalone`, background cream `#FBF7EF`, theme KIBO blue, `lang` en, icons 192/512 and a maskable icon generated from `public/kibo-mark.svg` into PNG files under `public/icons/` with a `node` script using an existing dependency, or hand-drawn SVG→PNG via Playwright screenshot), Apple touch icon and `apple-mobile-web-app-capable` metadata. A minimal service worker (`public/sw.js`) only to make the app installable and to show an offline page for `/app` when there is no network; it must **never cache** `/api/*`, SSE streams or `/assistant` session pages. Register it only on `/app` and `/assistant`, only in production builds.
2. **`/app` home (phone layout, P0 "home"):** KIBO logo, one line ("Talk to any kiosk that shows the KIBO QR."), a primary **[Scan a kiosk]** button (≥ 88px, KIBO blue; the scanner comes in the next step: link to `/app/scan`), **[Continue my order]** when `localStorage` holds a live session for this phone (resume `/assistant?s=…` with the stored device token; hide when none), and settings that persist in `localStorage` and are read by `/assistant`: language (한국어 / English), AI voice on/off, larger text (scales the phone UI root by 1.15; respects the system font size too). Copy in ko and en via `src/lib/i18n/phone.ts`. Header with [Call staff] is not shown here (no kiosk yet); a short "How it works" with three steps.
3. `/assistant` reads the stored settings on start (existing locale storage key stays compatible).
4. Tests first for the settings store (read/write/defaults, invalid values) and the "continue my order" logic (expired or paid sessions hidden). QA: add `/app` at 390×844, 360×800, 430×932 and 320 wide to the QA suite.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run qa:ui
```

## Verify
1. Run the AC commands; in a production build, Chromium's manifest check passes (`npx playwright` script that reads `navigator.serviceWorker` registration and fetches `/manifest.webmanifest`), and `/api/*` responses are not served by the service worker.
2. Update this step in `phases/12-phone-app/index.json` (completed + summary / error / blocked).

## Do not
- Do not make installation required anywhere; the QR link flow stays install-free.
- Do not cache API responses, tokens or session pages.
- Break existing tests.
