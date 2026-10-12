# Step 5: ui-qa-setup

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: UI_QA (all; "Automating (Playwright)" is the spec for this step, "Visual standard" and "KIBO numbers" are what the checks enforce), UX "Screen map".
- `playwright.config.ts`, `e2e/*.spec.ts` (step 4), `src/app/kiosk/page.tsx`, `src/components/kiosk/*`, `src/lib/client/api.ts`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Build the automated UI QA described in docs/UI_QA.md "Automating (Playwright)".

### Files
- `npm install -D axe-core`.
- `playwright.qa.config.ts`: `testDir: "e2e/qa"`, Chromium, its own `webServer` on port 3200 with `STORE=memory` (use `npm run dev -- --port 3200`; switch to `npm run start` only if a build exists and it is faster), output folder for screenshots and `ui-qa.jsonl`: `phases/<phase>/qa/` when the current git branch is `feat-<phase>` and `phases/<phase>/` exists (read the branch with `git rev-parse --abbrev-ref HEAD` via `child_process`; `PHASE` env overrides), else `qa-output/`. Harness sessions cannot prefix commands with env vars, so the branch rule is what they use.
- `e2e/qa/checks.ts`: reusable check functions run inside the page:
  - **axe-core** (H): tags `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa`, rule `target-size` enabled; violations → `h`; "incomplete" color-contrast over images → `t` with a note "human review".
  - **Font size** (H): the smallest rendered font size of visible text ≥ route minimum (kiosk 40px on the 1080×1920 canvas, measured in canvas px: divide by the canvas scale; phone 16px).
  - **Targets** (H): every visible `button, a, input, select, [role=button]` box ≥ route target (kiosk 40px canvas px, phone 56px) and ≥ 8px from its nearest neighbor.
  - **Overflow** (H): no horizontal scroll at 320px wide (phone routes only; the kiosk is a fixed canvas).
  - **Text spacing** (H): inject the WCAG 1.4.12 CSS and check no element's text is clipped (`scrollWidth > clientWidth` on elements with `overflow: hidden`).
  - **Focus** (H): tab through controls; each focused element has an outline ≥ 2px (or a visible focus ring via box-shadow) and `elementFromPoint` at its center returns it or a descendant.
  - **Tokens** (T): ≤ 4 distinct font sizes per screen (ignoring the order number), transitions ≤ 500ms except the 2 s highlight (allowlist by class/data attribute), line-height ≥ 1.5 for body text, spacing on the 4/8 scale.
  - **Reduced motion** (T→H for the listening pulse and card slide later): with `reducedMotion: "reduce"`, no running animation longer than 500ms.
- `e2e/qa/kiosk.qa.spec.ts`: kiosk states at 1080×1920 (and one screenshot at the `/demo`-like scaled size 600×1067 for the record): K1 attract, K2 dine, K3 menu (default, with a sold-out tile, with an AI highlight right after a phone `addToCart`), K4 sheet (variant step, drink step with nothing chosen, ingredients step), K5 upsell, K6 review with 2 lines, K7 card insert, K8 order number with countdown, KX staff banner (phone `callStaff`), idle warning if reachable cheaply (otherwise list it as not covered). Reach each state through the UI and the API (claim through `data-claim-url`).
- `"qa:ui": "playwright test -c playwright.qa.config.ts"` in `package.json`; `QA_ALL=1` makes `t` misses fail too. Add `qa-output/` handling: it is already git-ignored. Screenshots under `phases/**/qa/*.png` are git-ignored too; the JSON report is committed.

### Run it once
Run `npm run qa:ui`. **Fix every H failure on the kiosk screens** (that is in scope here: the kiosk was built in this phase). Log T misses in `docs/ISSUE.md` (reuse classes like `text-size`, `target-size`, `palette`; follow "How to use").

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run qa:ui
```

## Verify
1. Run the AC commands; `qa:ui` must pass (no H failures).
2. Look at three screenshots yourself (K1, K3 with highlight, K6) and note anything that looks broken in the summary.
3. Update this step in `phases/2-kiosk/index.json` (completed + summary / error / blocked).

## Do not
- Do not open any URL other than `http://localhost`.
- Do not load axe from a CDN; use the npm package.
- Do not loosen a threshold to make a check pass; thresholds come from UI_GUIDE and UI_QA.
- Break existing tests.
