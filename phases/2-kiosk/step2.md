# Step 2: kiosk-checkout

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: UX "Flow A" A8–A11, "Exception flows" (phone disconnected, idle, change of mind at payment, staff), "Screen map" K6, K7, K8, KX; UI_QA "Visual standard" (time limits, motion); ARCHITECTURE "Session state machine", `confirmCheckout`, `editOrder`, `cardAction`, `staffCalled`, `phoneSeenAt`.
- Files from steps 0–1: `src/components/kiosk/*`, `src/lib/kiosk/*`, `src/lib/i18n/kiosk.ts`, `src/lib/client/api.ts`, `src/hooks/*`, `src/app/kiosk/page.tsx`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Order review, virtual payment, order number, the kiosk banners, and demo counters. Pure helpers get tests first.

### Pure helpers (tests first): `src/lib/kiosk/timers.ts`
- `idleWarning(session, now, clockOffset) → { show: boolean; secondsLeft: number }`: show during the last 60 s before `expiresAt`.
- `phonePaused(session, now, clockOffset) → boolean`: a phone is connected and the last `phoneSeenAt` is more than 60 s ago.
- `staffBannerVisible(session, now, clockOffset) → boolean`: `staffCalled` set within the last 60 s.
- `doneCountdown(paidAt, now, clockOffset) → secondsLeft` (10 s).

### K6 order review (`ReviewScreen.tsx`, status `confirming`)
"주문 내역을 확인해 주세요": every line with photo, `lineLabel` title and detail, quantity − / + (`updateCart` qty; at 1 the − asks to remove, `removeFromCart`), line price; dine option; total in Space Grotesk 700 ≥ 64px. Buttons: "메뉴 더 담기" (`cancelCheckout`) and "결제하기" (`confirmCheckout`, `source: "touch"`, with the session's `cartVersion`). A cart change sends the session back to `ordering` (server rule); the screen follows the stream.

### K7 payment (`PaymentScreen.tsx`, status `paying`)
Local sub-steps: (1) payment method: "카드" enabled; "간편결제", "쿠폰" shown disabled with "지원하지 않아요" (coupons and wallets are out of scope, PRD); (2) "카드를 아래 투입구에 넣어 주세요" with an arrow and a slot drawing, a 0.5 s card-insert slide that runs only while waiting (static under `prefers-reduced-motion`), and a big "카드 넣기" button that simulates the insert (virtual payment, no real card); (3) "승인 중…" for 1.5 s, then `cardAction`. "주문 수정" (`editOrder`) is available in (1) and (2). Always show the total.

### K8 done (`DoneScreen.tsx`, status `paid`)
"영수증을 출력할까요?" ("출력" / "출력 안 함", both lead on; nothing prints), then the order number in Space Grotesk 700 at 200–280px, "번호를 부르면 카운터에서 받아 가세요", and a **visible 10 s countdown** "10초 후 처음 화면으로 돌아가요" (WCAG 2.2.1; UX A11). At 0 call `onNewSession()` (standalone `/kiosk` creates a fresh session and QR).

### KX banners (`KioskBanners.tsx`, on every screen)
- Staff called: fixed text by `reasonCode` ("직원을 불렀어요. 잠시만 기다려 주세요."), warning colors `#7A2E0E` on `#FFF1CC` with an icon, `role="status"`; never model text.
- Connection paused: "휴대폰 연결이 잠시 끊겼어요. 화면을 눌러 계속할 수 있어요."
- Idle warning: "계속 주문하시겠어요?" with seconds left and "계속하기" (sends `ping` with `active: true`). On expiry the stream reports `expired`; standalone `/kiosk` starts a new session.
- AI status line from step 1 stays where it is.

### Demo counters (`&demo=1` only)
A small overlay in a corner of the canvas: tap count (every `pointerdown` on a button inside the canvas after K1) and elapsed time from the first tap after K1 until `paid`, frozen at `paid`. Text ≥ 40px. Hidden without `demo=1` (UX heuristic 8). Expose the final values as `data-taps` and `data-seconds` attributes for the E2E test.

### Wire into `KioskScreen`
Replace step 0's placeholders. Every screen keeps the small QR or "휴대폰 연결됨" (Flow B) and the banners.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```
Then a smoke test with `npm run dev` (memory store): drive one full order through the API with the kiosk token (`startTouch`, `setDineOption`, `addToCart`, `requestCheckout`, `confirmCheckout` touch, `cardAction`) and fetch `/kiosk`; stop the server.

## Verify
1. Run the AC commands and the smoke test.
2. Check: total and order number sizes, countdown visible, no animation longer than 0.5 s except the 2 s highlight fade, reduced-motion rule present, banners use fixed copy from `src/lib/i18n/kiosk.ts`.
3. Update this step in `phases/2-kiosk/index.json` (completed + summary / error / blocked).

## Do not
- Do not let anything but the kiosk's card action reach `paid`, and do not add a client shortcut that skips `confirming` (CLAUDE.md safety promise).
- Do not show real payment brands, card networks or bank names.
- Do not return to K1 without the visible countdown.
- Break existing tests.
