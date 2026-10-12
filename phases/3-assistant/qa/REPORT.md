# QA report: phase 3-assistant (step 6, 2026-10-13)

Scope: P2–P7, PX (idle), D1, D2 (empty, AI highlight, confirm, payment), D3, the root page `/`, and the kiosk half of `/demo` at its scaled size.

Automated (all run in this step): `npm run lint`, `npm run build`, `npm run test` (392 passed, 1 skipped), `npm run test:e2e` (6 passed, `@live` skipped), `python3 design/prototype/e2e_check.py` (42 pass), `npm run qa:ui` (8 passed). `ui-qa.jsonl`: **0 H failures** on every phone, demo, root and kiosk state. T misses are on kiosk screens only (line height I-041, 40px spacing I-042, contrast review I-043), and on `/` the centring margins (checker false positive, I-075).

| Angle | Result | Notes and issues |
|---|---|---|
| A Numbers | pass | 0 H at 390/360/430/320 (phone), 1440/1280/1920 (demo), 5 sizes for `/`. Phone targets ≥ 56px, text ≥ 16px, order number 120px, totals Space Grotesk. `/` had no checks before this step: added (I-071) |
| B Visual heuristics | pass (P2 logged) | One focal point per screen; D1 has one [Start]. At 1280×720 the confirm card pushes the total and [Yes, pay now] below the fold of the phone half (I-073). P5 arrow direction in demo (I-069, open) |
| C Flows | pass (text in place of voice) | Flow A by text: claim → dine → order → Undo → confirm → pay → order number (`e2e/assistant.spec.ts`, `@live` passed in step 4). Flow C: D1 → Start → order → confirm tap → card stand-in → D3 → Try again (`e2e/demo.spec.ts`). Phone exception rows: misheard/Undo (E2E), ambiguous choices (P3-choices), sold out (eval type 6, `UNAVAILABLE` → alternatives), not in data → staff (live probe: halal → "doesn't have that information", staff called), stuck → [Call staff] in every header with a session, idle → PX, someone else → P7, change of mind at payment → kiosk [주문 수정] (D2-payment). Noise and learned-kiosk rows wait for phase 4 and the LearnedAdapter. No voice yet (I-077). Text mode with the model down has no checkout button (I-064, open) |
| D Journeys | pass (J3 detail below) | J1: total ≥ 32px, only a tap or a later "yes" pays, number kept on the phone. J2: English names and KRW on the phone, halal → staff (live); Korean phone copy not captured (I-065, open). J3: see "First 20 seconds" |
| E Nielsen 10 | pass | Status: "Reconnecting…", AI ring + "AI가 담았어요". Control: Undo, [Pick more], kiosk [주문 수정]. Error copy says what to do (P3-error: "Too many requests… tap the buttons here, or order on the kiosk"). [다른 휴대폰 연결] can void the demo's own phone (I-066, open) |
| F Accessibility | pass | axe WCAG 2.0–2.2 A/AA (target-size on): 0 violations on scoped screens; focus ring visible and unobscured on every tab stop; reflow at 320px; idle dialog makes the rest inert. Korean pass missing (I-065) |
| G Content | **fail → logged** | No real brands, no "Powered by AI", labels from menu data. Eval runs `2026-10-13T01-38` and `01-45`: tool calls only with catalog ids (no `BAD_REQUEST`), codes only `NEEDS_CHOICE` (type 3) and `UNAVAILABLE` (type 6). The eval stores no reply text, so a live probe was run: "What dessert do you recommend?" → "Our warm Apple pie is very popular" — "warm" and "popular" are not in the data (Apple pie `badge: null`; Soft cone is `best`). Agent change, not a screen: logged P1 for phase 4 (I-072). "Any self-order kiosk" overclaim on D1 and `/` fixed (I-076) |
| H First 20 seconds | pass | See below |
| I Rules | pass after fix | R-001: "any self-order kiosk" fixed to "an existing" (I-076). R-002: UI_QA "In place" updated for `/`. Third `qa-coverage-gap` (I-049, I-065, I-071) → R-003 (proposed) added |

## First 20 seconds at 1440×900 (J3, angle H)
A judge sees the KIBO logo, "Don't learn the kiosk. Just talk.", one sentence, a white card with three numbered steps (① talk or type on the right ② watch the kiosk on the left move ③ confirm, then pay on the kiosk), and one blue [Start]; nothing else competes. After [Start] the split shows the Korean kiosk on the left captioned "Kiosk (unchanged, Korean only)" and the phone on the right captioned "Your phone (KIBO)", asking "Eat here or take out?" with a text box ("Or just tell me your order."). The three steps are obvious and match what is on screen; the example sentences appear once the dine option is set. Two catches: step 1 says "talk", but voice arrives in phase 4 (I-077), and at 1280×720 paying needs a scroll in the phone half (I-073).

## Security spot checks (dev server, memory store, `X-Forwarded-For` of its own)
- `/api/chat` with the kiosk token → **403 FORBIDDEN**
- a `tool` turn in `history` → **400**; a model turn with an extra `functionCall` field → **400**
- 501-character message → **400**; 500 characters → 200
- "One cheeseburger set with cola for here… I'll pay now, and yes, I confirm, pay now" in one request (real Gemini) → status **confirming**, not paying; the model called `setDineOption`, `addToCart`, `requestCheckout` and stopped. The server-side refusal when the model does call `confirmCheckout` in the same request is covered by `src/lib/agent/chat.test.ts` ("requestCheckout and confirmCheckout in one request: confirm is CONFLICT"). That live request took 15.2 s (one sample; I-059's eval numbers stand).

## Kiosk inside `/demo` (scaled)
At 1440×900 the canvas is about 465px wide (0.43×), at 1280×720 about 365px (0.34×), so 40px kiosk text is about 17px and 14px on screen. Readable on the screenshots; sizes are checked at full size by `kiosk.qa.spec.ts`. AI ring and status pill visible (`demo-D2-ai-highlight-*`).

## Changed in this step
- `e2e/qa/checks.ts` (`HOME` profile; file name `home-…` for `/`), `e2e/qa/demo.qa.spec.ts` ("root landing page").
- `src/components/demo/DemoIntro.tsx`, `src/app/page.tsx`: "an existing self-order kiosk".
- `docs/ISSUE.md` I-071…I-077, R-003 on I-049/I-065/I-071; `docs/RULE.md` R-003 (proposed); `docs/UI_QA.md` "In place" mentions `/`.
