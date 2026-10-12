# Step 0: kiosk-shell

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: UI_GUIDE (all; "Canvas" matters most), UX "Screen roles", "Flow A" A1–A3, "Flow B", "Screen map" K1, K2, KX, "Accessibility"; ARCHITECTURE "API", ADR-010; SECURITY "Reliability" (kiosk resumes from localStorage).
- `AGENTS.md`, then the Next.js 16.4 guides in `node_modules/next/dist/docs/` for pages, client components, `useSearchParams`/search params, fonts and images.
- Phase 1 code: `src/types/*.ts`, `src/lib/adapters/catalog.ts`, `src/lib/commands/errors.ts`, `src/lib/commands/schemas.ts`, `src/app/api/**/route.ts`, `src/lib/http.ts`, `data/kiosks/malo.json`.
- Reference look: `design/prototype/Main.dc.html` (kiosk section; it draws the kiosk 596px wide, so **its pixel sizes are not the spec**, UI_GUIDE's 1080×1920 canvas numbers are), `src/app/globals.css`, `src/app/layout.tsx`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
The `/kiosk` page skeleton: canvas, session bootstrap, live stream, attract (K1) and dine option (K2). Pure logic gets unit tests first; components need no test-first.

### Client helpers (tests first for the pure parts)
- `src/lib/client/api.ts`: `createSession(kioskId, demo?)`, `sendCommand({ sessionId, token, type, args, source, cartVersion?, utteranceSeq? })` (adds `commandId = crypto.randomUUID()`, `Authorization: Bearer`), `ping(...)`. Failures throw `ApiError { code, message, detail }` parsed from the error JSON; network failures become `ApiError("NETWORK", "Connection problem. Please try again.")`.
- `src/hooks/useSessionStream.ts`: `useSessionStream(sessionId | null) → { session: Session | null; state: "connecting" | "open" | "gone" | "error" }` using `EventSource` on `/api/session/{id}/events`; parse `data:` JSON; `event: gone` → state `gone`; reconnect is `EventSource`'s own.
- `src/hooks/useKioskSession.ts`: for standalone `/kiosk`. Reads `localStorage["kibo.kiosk." + kioskId]` = `{ sessionId, kioskToken, claimUrl }`; if absent, or the stream reports `gone`, or the session is `expired`, creates a new session and stores it. Exposes `{ sessionId, kioskToken, claimUrl, session, newSession(), setClaimUrl() }`. Pings every 30 s with `active` = a touch happened in the last 30 s; keeps `clockOffset = serverTime - Date.now()`.
- `src/lib/kiosk/screen.ts` (**pure, unit-tested**): `kioskScreen(session, local) → "attract" | "dine" | "menu" | "review" | "payment" | "done"` from `session.status` plus local state (`touchStarted`): `idle` → attract (dine if `touchStarted`); `connected` → dine; `ordering` → dine when `dineOption === null` and the cart is empty and the order started by touch, else menu; `confirming` → review; `paying` → payment; `paid` → done.

### Strings: `src/lib/i18n/kiosk.ts`
All kiosk copy as `{ ko, en }` entries with a `kt(key, locale)` helper. The kiosk renders `kiosk.locale` (Korean now; an English kiosk is planned, `docs/ISSUE.md` I-019, so never hard-code copy in components). Copy follows real kiosk wording (UX "Copy").

### Canvas and theme: `src/components/kiosk/KioskCanvas.tsx`
A fixed 1080×1920 box scaled with CSS `transform: scale(s)` to fit its parent (`s = min(w/1080, h/1920)`, centered, letterboxed on a dark neutral), measured with `ResizeObserver`. Sets CSS variables from `kiosk.theme` on the root (`--k-primary`, `--k-primary-dark`, `--k-primary-tint`, `--k-accent`, `--k-bg`) so other kiosks can reuse every component. **All kiosk sizes are canvas px.** Rules from UI_GUIDE / UI_QA: every text ≥ 40px, targets ≥ 64px for primary actions and ≥ 40px otherwise with ≥ 8px gaps, contrast ≥ 4.5:1, radius 32px tiles / 48px sheets, no glass blur, gradient text, neon, emoji icons or "Powered by AI".

### Screen component: `src/components/kiosk/KioskScreen.tsx`
Props: `{ kiosk: KioskData; session: Session | null; kioskToken: string | null; claimUrl: string | null; demo: boolean; onNewSession(): void }`. It must not create sessions itself, because `/demo` (a later phase) supplies its own demo session and tokens to the same component. It renders the current screen from `kioskScreen()`; this step builds:
- **K1 attract:** brand header, hero photo (`/menu/hero.jpg`) with a short Korean headline from the data's `tagline`, two large equal choices: "휴대폰으로 말해서 주문 (QR)" with a real QR of `claimUrl` (`qrcode` → SVG string rendered as an `<img>` data URL, ≥ 360px, alt text) and "화면을 눌러서 주문"; a language row (한국어 active; English disabled with "준비 중" for now) and a "큰 글씨 · 낮은 화면" button (may toggle a local `large` mode that scales text by 1.15; keep it simple). Tapping touch sends `startTouch`.
- **K2 dine option:** "매장에서 드시나요, 포장하시나요?" with two photo cards (`dineOptions` images), sends `setDineOption`. When a phone is connected (`phoneConnectedAt`), K2 shows "휴대폰이 연결됐어요. 휴대폰에서 주문하거나 여기서 눌러도 돼요."
- A placeholder for menu/review/payment/done that the next steps replace (one line of text is enough).
- **Command errors** show a plain-words message in a dismissible bar, never codes.
- Mark the QR `<img>` with `data-claim-url={claimUrl}` so E2E tests can scan it without a camera.

### Page: `src/app/kiosk/page.tsx`
`/kiosk?k=malo` (default `malo`; unknown id → a simple "kiosk not found" message) and `&demo=1`. Client component tree: `useKioskSession` + `KioskScreen` inside `KioskCanvas` filling the viewport (`100dvh`, no page scroll). `<html lang>` for this route is `ko` (set `lang` on the kiosk root element if the root layout cannot vary).

### Tests (unit)
`kioskScreen()` for every status and the touch/phone variants; `sendCommand` builds the header and body and maps an error JSON to `ApiError` (mock `fetch`).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```
Then smoke-test: `npm run dev` (memory store) in the background, open `/kiosk` with `node -e` + `fetch` to check it returns 200 and contains the canvas root, create a session through the page's API call path if possible, stop the server.

## Verify
1. Run the AC commands and the smoke test.
2. Check: every kiosk text ≥ 40px on the canvas (read the classes/styles you wrote), colors from `--k-*` variables, Korean copy from `src/lib/i18n/kiosk.ts`, no technical words on screen (session, token, agent).
3. Update this step in `phases/2-kiosk/index.json` (completed + summary / error / blocked).

## Do not
- Do not import `firebase-admin`, `src/lib/store/*` or `src/lib/session/*` into client components (server only).
- Do not write session state anywhere but through `POST /api/command`; browsing state (which category is open) stays local.
- Do not use the prototype's pixel values; use the canvas spec.
- Do not build K3–K8 yet; later steps do.
- Break existing tests.
