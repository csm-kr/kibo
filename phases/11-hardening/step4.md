# Step 4: lighthouse

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. UI_QA (all), UI_GUIDE; RULE R-001; `docs/plan/STRATEGY.md` (read it: the teammate was to produce a Lighthouse accessibility score; this step measures it on the local production build).
- Code: `src/app/**`, `next.config.ts`, `public/**`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Measure and improve Lighthouse scores on a local production build (`npm run build && npm run start`, `STORE=memory`, `ALLOW_MEMORY_STORE=1`), using `npx lighthouse` (or the `lighthouse` npm package via a script) with the installed Chromium (`CHROME_PATH` from Playwright if needed):
- Pages: `/` (desktop and mobile), `/demo` (desktop), `/assistant` with a claimed session (mobile), `/kiosk` (desktop).
- Record Performance, Accessibility, Best Practices, SEO per page into `evidence/lighthouse.json` with the Lighthouse version and date; save the HTML reports under `phases/11-hardening/qa/` (git-ignored if large; keep the JSON summaries).
- Fix what is clearly worth it: accessibility failures (any < 100 must be explained or fixed), image sizes and formats (menu photos are 640px JPEGs; use `next/image` sizes where missing), unused JavaScript on `/`, layout shift, missing meta. Re-measure after fixes; keep both runs in the evidence file.
- Update the TESTING ledger with the final scores (automated, local production build, not the deployed URL) and README's evidence table (R-001).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run qa:ui
```

## Verify
1. Run the AC commands; `evidence/lighthouse.json` has before and after.
2. Update this step in `phases/11-hardening/index.json` (completed + summary with the scores / error / blocked).

## Do not
- Do not chase a score by hiding content or removing features.
- Break existing tests.
