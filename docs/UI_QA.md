# UI QA

Judges meet KIBO through its screens: the video, `/demo` and the deck screenshots. There is also a Best UI/UX special award (`docs/plan/STRATEGY.md`). So a screen is done only after a QA pass, and every pass looks from several angles, because one angle misses what another catches.

**When:** after every UI change or polish, and as the `qa` step that ends every harness phase (`scripts/execute.py` enforces it).

**Sources of truth:** look, colors and components in `docs/UI_GUIDE.md`; flows, exceptions, screen map (screen ids K1–K8, KX, P1–P7, PX, D1–D3) and Nielsen rules in `docs/UX.md`; journeys in `docs/USER_JOURNEY.md`; rules from repeated issues in `docs/RULE.md`. Findings go to `docs/ISSUE.md`. The reference prototype is `design/prototype/Main.dc.html`; `Main.dc.before-polish.html` is the state before the 10-12 polish pass, for comparison.

## Viewports
Measure in CSS px at these sizes. Phone numbers apply as written; kiosk numbers apply to the 1080×1920 kiosk canvas (UI_GUIDE "Canvas").

| Screen | Viewports |
|---|---|
| Phone `/assistant` | 390×844 (main), 360×800 (small Android), 430×932 (large), 320 wide (reflow) |
| Kiosk `/kiosk` | 1080×1920 portrait, and the scaled size used in `/demo` |
| `/demo` | 1440×900 (judge laptop), 1280×720, 1920×1080 |

## The QA pass
1. **Scope.** List the screens the change touched by screen-map id, plus every state they can show (empty, loading, long name, 20 cart lines, sold out, error, AI highlight).
2. **Automated checks.** Run them first; a red command stops the pass.
   ```bash
   npm run lint && npm run build && npm run test
   python3 design/prototype/e2e_check.py      # while the prototype is the reference
   npm run qa:ui                              # Playwright H checks, once it exists (see "Automating")
   ```
3. **Screenshots.** Capture each scoped screen and state at each viewport (`npm run qa:ui`; Aside by hand for interactive passes) into `phases/<phase>/qa/` (harness) or the session scratchpad (interactive). Look at the images, not only the code.
4. **Angles.** Go through each angle below on the screenshots and the code. Each finding names the screen id, the angle, the severity (P0/P1/P2, see "Visual heuristics") and the evidence (file:line, measured value, screenshot).
5. **Fix or log.** Fix what is in scope; log everything else in `docs/ISSUE.md` (a repeated class adds to `Seen`; the 3rd time adds a rule in `docs/RULE.md`). Re-run step 2 after fixes.
6. **Fresh eyes.** Where possible, a reviewer that did not write the change (a harness `qa` session or a separate agent) does steps 3–4 again from the screenshots and this file.

## Angles
| # | Angle | What to check | Where the rules are |
|---|---|---|---|
| A | Numbers | Sizes, spacing, type, contrast, targets match the tables below | "KIBO numbers", "Visual standard" |
| B | Visual heuristics | Hierarchy, alignment, grouping, consistency, density | "Visual heuristics" |
| C | Flows | Flow A, B, C and every exception row run end to end on the real screens | `docs/UX.md` |
| D | Journeys | Every "What must work" cell holds for J1–J3 | `docs/USER_JOURNEY.md` |
| E | Nielsen 10 | Each heuristic's KIBO rule holds on the scoped screens | `docs/UX.md` |
| F | Accessibility | Labels, roles, focus, `aria-live`, system font size, color not alone | `docs/UI_GUIDE.md`, "Visual standard" |
| G | Content | Names, prices and options only from menu data; no real brands; plain words; kiosk copy in Korean | `CLAUDE.md`, `docs/UX.md` Copy |
| H | First 20 seconds | A cold judge on `/demo` knows what to do and sees the kiosk move | J3 in `docs/USER_JOURNEY.md` |
| I | Rules | Nothing in `docs/RULE.md` is broken | `docs/RULE.md` |

## KIBO numbers (from UI_GUIDE and UX)
| Item | Rule |
|---|---|
| Touch targets | ≥ 56×56px; primary buttons full width on the phone |
| Phone text | body ≥ 20px; secondary lines ≥ 16px |
| Kiosk text | every text ≥ 40px on the 1080×1920 canvas |
| Totals, order numbers | Space Grotesk 700, ≥ 32px; order number 100–140px |
| Contrast | all text ≥ 4.5:1; never color alone |
| Colors | Kiosk: MALO palette. Phone: KIBO blue `#3446D4` for primary buttons, mic, selection, order number. Shared: cream, ink, warning |
| Radius | phone: tiles 18px, sheets 26px; kiosk canvas: tiles 32px, sheets 48px; pills full |
| Product tile (kiosk canvas) | photo 272px high, name 40px bold, price 40px teal, kcal 40px, badge top-left |
| Set sheet | step label with steps left, 3-column photo options, selected = 6px teal border + tint ring (kiosk canvas) |
| AI change | 6–8px teal ring (kiosk canvas) for 2 s on the kiosk tile and cart chip + "Added by AI: …" status |
| Motion | state feedback only: 2 s highlight fade, 0.5 s card-insert slide, listening pulse |
| Phone screen | one task per screen; only the last two messages large; staff button always in the header; cart and total readable on the phone alone |
| Anti-patterns | no glass blur, gradient text, neon glow, "Powered by AI", emoji icons, same radius everywhere |

## Visual standard
General rules from public standards, researched 2026-10-12. **H** = hard gate (WCAG 2.2 A/AA, Korean kiosk rule, or UI_GUIDE): on a screen the phase changed, the `qa` step fixes it; if the fix is out of scope or needs a decision, it logs the issue and sets the step `blocked` with the issue id. **T** = KIBO target (AAA or guidance chosen for older users): a miss is logged in `docs/ISSUE.md`, nothing more. Where this table and `docs/UI_GUIDE.md` differ, UI_GUIDE wins until it is changed; the kiosk canvas and text size were aligned on 10-12 (I-004, I-011).

Unit conversions (own calculation): kiosk 1080×1920 on a 27" panel → 1 px ≈ 0.311 mm (32" → 0.369 mm); phone 390×844 → 1 CSS px ≈ 0.166 mm.

| Area | Rule | Level | Source |
|---|---|---|---|
| Contrast | Text ≥ 4.5:1 (no rounding up); large text (≥ 24px, or ≥ 18.5px bold) ≥ 3:1 | H | [WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) |
| Contrast | Body text ≥ 7:1 for older eyes | T | WCAG 1.4.6; [WAI older users](https://www.w3.org/WAI/older-users/developing/) |
| Contrast | Control edges, states, meaningful icons, focus rings ≥ 3:1 against neighbors | H | WCAG 1.4.11 |
| Contrast | Kiosk text and controls ≥ 4.5:1 (NIA allows 3:1 for text over 12 mm; KIBO keeps 4.5:1 everywhere); no red on green, no yellow on blue | H | [NIA kiosk UI guide](https://designdb.com/usr/upload/board/zboardphotogallery176/20250102020609692_8437.0.pdf) p.36 |
| Color | Never the only signal: selection also gets a border or shape and a label | H | WCAG 1.4.1; NIA p.38 |
| Kiosk text | Every character ≥ 12 mm tall ≈ **40px** on the 1080×1920 canvas (27"). Automated check: `font-size` ≥ 40px (a lower bound only); once per pass, measure the rendered Hangul glyph on a screenshot | H | NIA p.35; MSIT notice; UI_GUIDE |
| Phone text | Body ≥ 20px, secondary ≥ 16px, nothing under 16px (UI_GUIDE; KRDS body minimum 16, default 17; NN/g ≥ 16 for seniors) | H | UI_GUIDE; [KRDS](https://www.krds.go.kr/html/site/style/style_03.html); [NN/g seniors](https://www.nngroup.com/articles/usability-seniors-improvements/) |
| Type | ≤ 4 text sizes per screen, e.g. 16 / 20 / 24 / 32 (the order-number display does not count); no thin weights at small sizes; sans-serif | T | [NN/g visual design](https://www.nngroup.com/articles/principles-visual-design/) (2–3 sizes); HIG |
| Line height | Korean body 1.5; headings 1.2–1.3 | T | KRDS; WCAG 1.4.8 |
| Line length | ≤ 40 Korean characters, ≤ 80 Latin; no justified text | T | WCAG 1.4.8 |
| Text resize | 200% text size loses no content or function | H | WCAG 1.4.4 |
| Text spacing | With line height 1.5×, paragraph 2×, letter 0.12×, word 0.16× injected, nothing is clipped or overlaps | H | [WCAG 1.4.12](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html) |
| Reflow | No two-direction scrolling at 320 CSS px wide | H | [WCAG 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) |
| Phone targets | Every target ≥ 56×56px (UI_GUIDE; WCAG AA is 24, AAA 44, Android 48) | H | UI_GUIDE; [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) |
| Phone targets | Primary and frequent actions ≥ 60px tall; mic and "Yes, pay now" ≥ 88px (≈ 14.6 mm, above the 14 mm that older users hit > 97% of the time) | T | [Leitão & Silva, ages 65–95](https://mural.maynoothuniversity.ie/6045/1/PS-Target-Spacing.pdf) |
| Kiosk targets | Shortest side ≥ 12 mm and area ≥ 150 mm² (≈ 40px at 27") | H | NIA p.35 |
| Kiosk targets | Primary actions ≥ 64px; frequent actions low on the screen | T | NIA pp.35, 43–44 |
| Target gaps | ≥ 8px between targets (kiosk: ≥ 2.5 mm ≈ 8px) | H | NIA p.35; [web.dev](https://web.dev/articles/accessible-tap-targets) |
| Spacing | Every margin, padding and gap is on the 4/8 scale: 4, 8, 12, 16, 24, 32, 48, 64 | T | [8-pt grid](https://spec.fm/specifics/8-pt-grid); Material |
| Layout | Phone side margin ≥ 16px; label-to-field 8px; between cards 16–24px | T | [KRDS layout](https://www.krds.go.kr/html/site/style/style_05.html) |
| Icons | 24px base (16/20/24/32/40), 1.5–2px stroke, always with a text label | T | [KRDS icons](https://www.krds.go.kr/html/site/style/style_06.html); NIA p.37 |
| Buttons | 1–2 prominent buttons per view; preferred option set apart by style, not size; every button has pressed, disabled and focus states | T | [HIG buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) |
| Focus | Always visible; never fully hidden by sticky content; ≥ 2px solid outline with ≥ 3:1 change | H (2.4.7, 2.4.11) / T (2.4.13) | [WCAG 2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html), [2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html) |
| Motion | Most transitions 100–400ms, none over 500ms except UI_GUIDE's 2 s highlight fade; ease-out; `prefers-reduced-motion` turns movement into fades | T | [NN/g animation](https://www.nngroup.com/articles/animation-duration/) (100–500ms); WCAG 2.3.3 |
| Motion | Nothing moves on its own for > 5 s without pause; nothing flashes > 3 times per second. Exception: a status indicator that runs only while its state lasts (listening pulse, card-insert animation while waiting for the card) is status, not decoration; it stops when the state ends and is static with reduced motion | H | WCAG 2.2.2, 2.3.1; NIA p.40 |
| Time limits | Warn before expiry and allow extending with one action, ≥ 20 s to respond, at least 10 times. KIBO: 1 min warning with [Continue]; after payment the kiosk shows a visible 10 s countdown before returning to K1 | H | [WCAG 2.2.1](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html); NIA p.40 |
| Response | Busy state after 1 s; progress after 10 s | T | [NN/g response times](https://www.nngroup.com/articles/response-times-3-important-limits/) |

Not verified: the full KS X 9211 text (revised 2025-12-23) and whether the 2025 MSIT draft that relaxes text to 7.25 mm for screens ≤ 28 cm became final. Treat 12 mm as the rule.

## Visual heuristics
Ten-second checks on each screenshot, like Nielsen's ten but for the look. Sources: [NN/g visual design](https://www.nngroup.com/articles/principles-visual-design/), [Gestalt proximity](https://www.nngroup.com/articles/gestalt-proximity/), [Fitts's law](https://www.nngroup.com/articles/fitts-law/), NIA kiosk guide, Seoul Digital Foundation [kiosk guide](https://www.khan.co.kr/kh_storytelling/2022/kiosk_quiz/data/kiosk_guide.pdf).

| # | Heuristic | Check |
|---|---|---|
| V1 | One focal point | Squint: exactly one element wins; ≤ 4 text sizes; ≤ 2 prominent buttons |
| V2 | Proximity | Space inside a group is smaller than space between groups; a label sits closer to its own field than to the one above |
| V3 | Alignment | Every left edge lines up with a shared margin or column; spacing values come from the 4/8 scale |
| V4 | Consistency | The same component looks the same and sits in the same place on every screen (header, staff button, cart bar, primary button) |
| V5 | Legibility | Contrast passes; no thin weights at small sizes; no text over busy photos |
| V6 | Affordance and state | Buttons look pressable; pressed, selected, disabled and focus states exist; selection not by color alone |
| V7 | Fitts | Primary and frequent targets are large and near the last action; destructive actions are not next to primary ones |
| V8 | Restraint | One task per screen; no decoration competing with content; no promotion in the middle of a task (the dessert upsell is once per order) |
| V9 | Icon plus label | Standard shapes, always with text |
| V10 | Calm motion | Each animation has a purpose; nothing autoplays; reduced motion honored |
| V11 | Complete states | Empty, loading, error (what happened + what to do) and success all designed |
| V12 | Wayfinding | Step indicator with numbers and words, showing steps left ("Step 2 of 4 · set") |

Rate each finding: **P0** broken or unsafe, **P1** rule violation, **P2** polish. There is no standard pixel tolerance for build vs design; KIBO treats a difference of ≤ 2px as P2 and > 2px on a size, gap or alignment as P1.

## Automating (Playwright)
Automated UI checks run in headless Chromium with Playwright, the same tool as the E2E tests. Decided 10-12 (Claude, with decisions delegated by the user): harness `qa` steps run unattended for hours, and Playwright sets exact viewports, emulates `prefers-reduced-motion`, injects axe with `addScriptTag` and never touches a browser that holds personal logins. Aside (`aside repl`) stays available for interactive passes and for capturing video footage (`.claude/skills/motion-demo-video/references/aside-capture.md`); its 1.26 gaps are in `docs/ISSUE.md` I-016.

**Setup (once).** The first phase that builds a real screen gets a step before its `qa` step that adds:
- `e2e/ui-qa.spec.ts` (run by its own config `playwright.qa.config.ts`, so `npm run test:e2e` stays fast): for each route and state in a list, at each viewport, run the checks below, save screenshots, and write one JSON line per route and viewport `{ route, state, viewport, h: [failures], t: [misses], shots }` to the output folder.
- `"qa:ui": "playwright test -c playwright.qa.config.ts"`: the config starts the app with `STORE=memory` on its own port, writes screenshots and the JSON report to `phases/$PHASE/qa/` (or `qa-output/` outside the harness, git-ignored), and the run fails if any `h` list is not empty. `QA_ALL=1` also fails on `t`.
- States are reached through the real UI and the API (claim with the QR's `data-claim-url`, send commands with the tokens), never by mocking components.
- It opens only `http://localhost` URLs. axe-core comes from the `axe-core` npm package, not a CDN.

Until then the `qa` step checks the angles from code and the prototype and says so in its report.

**In place (10-13, 2-kiosk:5):** `playwright.qa.config.ts` (port 3200), checks in `e2e/qa/checks.ts`, kiosk states in `e2e/qa/kiosk.qa.spec.ts` (K1, K2, K3 with a sold-out tile and with an AI highlight, K4 variant / empty drink / ingredients, K5, K6, K7 card insert, K8 receipt and order number, KX staff banner and idle warning, plus one K1 screenshot at the 600×1067 `/demo` size). Output goes to `phases/<phase>/qa/` on a `feat-<phase>` branch, else `qa-output/`. The phone thresholds (`PHONE` profile, 320px reflow) are ready for `/assistant`.

**Phone (10-13, 3-assistant:3):** `e2e/qa/assistant.qa.spec.ts` checks P-start, P2, P3 (empty, two lines, choice buttons, error), P4, P5, P6, P7 taken at 390×844, 360×800, 430×932 and 320×700 (each with the reflow check), and PX idle warning at 390×844. English only so far (I-065). Voice (4-voice): P1 mic hint and in-app browser, P2 mic connecting and in-app banner, P3 listening, voice fallback, noise hint, voice reconnecting and voice failed (fake Live socket, no network), and PX "Reconnecting…" after the session stream drops; D2 voice fallback in the demo spec.

**Demo (10-13, 3-assistant:4):** `e2e/qa/demo.qa.spec.ts` checks D1, D2 (empty, AI highlight, confirm card, payment) and D3 at 1440×900, 1280×720 and 1920×1080, plus no page scroll. Profile `DEMO` measures the intro and the phone column (`[data-demo-check]`); the scaled kiosk half is judged on the screenshots, its sizes are checked at full size by the kiosk spec. The root page `/` has its own spec since 5-ship:1: `e2e/qa/landing.qa.spec.ts` (profile `HOME`) at 1440×900, 1280×720, 390×844 and 320×700 with reflow, one check and screenshot per section (`data-landing-section`), because the target checks only measure what is on screen. Its pictures are real captures from `npm run shots:landing` (`scripts/landing-shots.ts`, in-memory store, no model calls) in `public/landing/`. Since 7-environments:5, D1 has three place cards (pictures `public/landing/place-*.webp`, also on the landing section "One phone, many kiosks", `places`), and the demo spec adds D1, D2 (empty, ticket added with highlight, confirm, payment) and D3 for `/demo?k=airport_rail` at the three judge sizes. Since 8-scenarios:2 the demo spec adds D2 with the scenario guide open (`D2-scenarios-list`) and a scenario half done (`D2-scenario-half`) at the three judge sizes; profile `DEMO_GUIDE` measures the guide column (`[data-scenario-guide]`), because `DEMO` scans only the first `[data-demo-check]`. Since 7-environments:6 the kiosk spec walks the airport rail ticket machine (K1, K3, K4 passenger, K6, K7, K8 receipt and reference number) and MALO in English (K1 to K8).

**Learned kiosk (10-13, 6-learn:2):** `e2e/qa/learned.qa.spec.ts` checks `/learned/doughhouse` (QR, then an item the bridge entered) at 1440×900, 1280×720 and 1920×1080. Profile `LEARNED` measures only KIBO's widget (`[data-learned-widget]`); the learned kiosk page in the iframe is third-party and unchanged, so it is judged on the screenshots. Since 6-learn:3, `e2e/qa/learned-phone.qa.spec.ts` checks the phone on a learned kiosk at the four phone sizes (P2 and P3 "The kiosk is entering it…" at 390 and 320 wide, P3 "Please check the kiosk screen" after 15 s, P3 mismatch, P4 without a pay button; the test sends the bridge's reports itself), and `e2e/qa/demo.qa.spec.ts` checks D1, D2 and D3 with `/demo?k=doughhouse` at 1440×900.

**What the script checks:**
- **axe-core** (H) with the WCAG 2.0/2.1/2.2 A and AA tags, with `target-size` turned on explicitly (off by default). Contrast results marked "incomplete" (text over images) go to human review.
- **Computed styles:** minimum font size per route and every interactive element's box ≥ the route's target size and ≥ 8px from its neighbor (H); body line-height ≥ 1.5, margins, paddings and gaps on the 4/8 scale, radius, font family and weight from the tokens, ≤ 4 font sizes per screen, transitions ≤ 500ms unless allowlisted (T).
- **Robustness** (H): no horizontal overflow at 320px wide; no clipped text after injecting the WCAG 1.4.12 spacing CSS or at 200% root font size.
- **Focus** (H): `focus()` each control in order; the outline is ≥ 2px and `elementFromPoint` at its center returns it.
- **Screenshots:** every scoped screen and state per viewport. There is no pixel-diff baseline; steps 3–4 compare them by eye with the prototype and the previous pass.

Captures: phone at 390×844, 360×800, 430×932 and 320 wide; kiosk at its 1080×1920 design canvas (sizes are checked there, not in the scaled `/demo` preview); every state (default, loading, empty, error, success, focus visible). Angles B–I still need human or agent eyes, and once a pass on real hardware: the phone at arm's length, the kiosk at real panel size with a ruler on the text.

## Phase-end QA step
The last step of every harness phase is `qa`. Its step file:

````markdown
# Step {N}: qa

## Read first
- `CLAUDE.md` and `docs/*.md` are already in your prompt; do not re-read them.
- What this phase changed: `git diff --stat main...HEAD`, then the changed files.

## Task
Run the QA pass in docs/UI_QA.md on the screens this phase changed: {screen ids}.
Save screenshots in phases/{phase}/qa/. Fix H failures on these screens.
Log everything else in docs/ISSUE.md following its "How to use".
If an H failure is out of scope or needs a decision: log it and set this step "blocked" with the issue id.
Write phases/{phase}/qa/REPORT.md: one line per angle A–I with pass/fail and issue ids.

## Acceptance criteria
```bash
npm run lint && npm run build && npm run test
python3 design/prototype/e2e_check.py
npm run qa:ui        # once the UI QA spec exists
```

## Do not
- Change features or scope while fixing; only fix what breaks a written rule.
- Mark the step completed while an H rule fails on a changed screen.
````
