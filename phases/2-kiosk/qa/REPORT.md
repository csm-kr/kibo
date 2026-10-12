# Phase 2-kiosk QA report (step 6)

Date 10-13. Scope: the `/kiosk` screens K1–K8 and KX on the 1080×1920 canvas (MALO BURGER, Korean).

Automated checks (run in this session, after the fixes below): `npm run lint` clean; `npm run build` ok; `npm run test` 19 files passed, 1 skipped, 282 tests passed; `npm run test:e2e` 4 passed; `python3 design/prototype/e2e_check.py` 42 pass, 0 fail; `npm run qa:ui` 3 tests, 15 states, **0 H failures** (`ui-qa.jsonl`). Screenshots: the 15 `kiosk-*.png` files in this folder, all looked at by eye.

Fixed in this step:
- K8: the receipt countdown started at "11초" because of clock-offset error; capped at 10 with a test (I-047).
- K1, K2: Korean text broke inside words ("찍으세 / 요", "포장하시나 / 요?"); `break-keep` on the kiosk canvas (I-044).

## Angles
| # | Angle | Result | Issues |
|---|---|---|---|
| A | Numbers | pass for H: every kiosk text ≥ 40px, targets ≥ 40px with ≥ 8px gaps, contrast passes axe; T misses logged: line height 1.35/1.3 against 1.5, 40px and 96px spacing off the 4/8 scale | I-041, I-042 |
| B | Visual heuristics | pass with P2s: one focal point and one primary (mustard) button per screen, step label "1/4 단계 · 세트 선택" (V12), sold-out tile has text and is disabled (V6), toolbar in the same place on K3/K6/K7 (V4); the AI pill and the staff banner cover the top tile row | I-045 |
| C | Flows | pass: Flow B touch hero order to order number (`kiosk-touch.spec`), Flow A kiosk side (phone add → K3 ring + "AI가 담았어요", review, payment, `kiosk-mirror.spec`), exceptions: sold out, staff banner, idle warning with [계속하기], second phone refused, [주문 수정] on K7, 10 s countdown back to K1 with a new QR (`kiosk-states.spec`). Gaps: K2 has no small QR or way back; "connection paused" checked in code and unit tests only | I-048, I-049, I-036, I-039 |
| D | Journeys | pass for the kiosk parts: J1 Arrive (two equal large choices, "휴대폰으로 말해서 주문 (QR)" at 48px bold on K1, `KioskScreen.tsx:219`), Order (the phone's add rings the tile and shows "AI가 담았어요" in `kiosk-mirror.spec`; the 3 s latency target is measured later, `docs/TESTING.md`), Pay (total 72px on K6/K7, only a card action pays), After (order number 240px); J2 Ask (staff banner with fixed text), Order (kiosk stays Korean, 2 s ring shows where) | I-045 |
| E | Nielsen 10 | pass with P2s: 1 status (AI status line, phone connected, countdowns), 3 undo/edit ([주문 수정], [메뉴 더 담기]) but no way back from K2 and a review quantity change drops to K3, 5 confirm dialogs for clear all and remove, 9 errors in plain Korean (`errorCopy`) | I-048, I-036 |
| F | Accessibility | pass: axe WCAG 2.2 AA with target-size clean on all 15 states; focus visible and never under a scrim (`ModalLayer` inert, I-040); `role="timer"`, `alertdialog` for the idle warning, `aria-live` AI status; card-insert motion off with reduced motion. Contrast over the teal header and the − / + glyphs left to human review: checked by eye on K6, KX-staff, readable | I-043 |
| G | Content | pass: names, prices and options come from `data/kiosks/malo.json`; no real brands (MALO BURGER is fictional, drinks are "콜라", "제로콜라", "사이다"); kiosk copy is Korean and follows real kiosk wording ("세트로 드릴까요?", "카드를 아래 투입구에 넣어 주세요", "영수증을 출력할까요?") | |
| H | First 20 seconds | n/a: `/demo` is built in a later phase; K1 alone shows both ways to order at a glance | |
| I | Rules | pass: R-001 (every number in this report names its command or file), R-002 (no contract changed in this step) | I-035 |

## Also found
- `undefined/` (15 screenshots and a `ui-qa.jsonl` from I-046) was committed in `00b3233`; it needs `git rm -r undefined/` by hand (I-035).
- The Next.js dev indicator ("N", bottom left) is in every screenshot because `qa:ui` runs the dev server; it is not in production builds.
