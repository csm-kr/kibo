# Step 2: kiosk-polish

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. UI_GUIDE (kiosk parts), UX (K-screens), UI_QA (kiosk rows), RULE (all).
- Code: `src/components/kiosk/*`, `data/kiosks/malo.json`, `data/kiosks/airport_rail.json`, `public/` kiosk images, the learned kiosk app (`spikes/kibo-learn/kiosk/` and the copy the product serves), `skills/doughhouse.json`, `e2e/learned.spec.ts`, `e2e/kiosk-*.spec.ts`.
- Owner feedback on the video (10-14): "the kiosk quality is low; the pizza kiosk looks unfinished, the burger kiosk needs work too". UX judge: product photos still blank when the first highlight fires; the dine sheet's photos blank on screen.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
The kiosks are what judges look at most in the video and on `/demo`. They stand for existing Korean kiosks, so they must look like real, finished commercial kiosks (in our own fictional brands), not prototypes.

## Task
1. **Critique first:** screenshot MALO (K1–K8), the airport rail machine and the pizza kiosk at 1080×1920; list in `phases/14-final/KIOSK_POLISH.md` the 10–15 most visible gaps against a finished commercial kiosk (empty areas, flat cards, inconsistent image sizes, weak attract screen, cart bar, typography scale, loading states, missing photos), each with the fix.
2. **MALO and the airport machine:** implement the fixes that change looks only: preload and size every menu image so none is blank when shown (including the dine sheet), a richer attract screen (brand hero, promo banner in the fictional brand, clear two-way choice), consistent card shadows and radii, a stronger cart bar, larger and clearer prices, a polished review and payment screen. Keep every label, accessible name, role, flow and data id that tests, the AI tools and the kiosk subtitles rely on.
3. **Restyle the Doughhouse (pizza) kiosk so it looks like a finished kiosk** (owner and UX judge, 10-13: "the pizza kiosk looks unfinished / like an unstyled page"): `spikes/kibo-learn/kiosk/` (and the copy the product serves, if separate) gets a real kiosk look in its own fictional brand (header, category rail, item cards with simple CSS/emoji pictures, a clear cart bar, large Korean type) **without changing any visible label, role, accessible name, DOM order of interactive elements or flow that `skills/doughhouse.json` uses**. Prove it: `e2e/learned.spec.ts` (bridge replay) passes unchanged, the run 3 holdout orders replay 4/4 with the AI-free runner against the restyled kiosk, and a test asserts the list of tappable labels is identical before and after. If a label must change, stop and log it instead.
4. **IP risk (video expert, 10-14):** the MALO BURGER logo tile (a yellow/golden "M" on a square) can remind viewers of a real fast-food chain. Redesign the mark so it cannot be confused with any real brand (different letterform, color and shape; for example a wordmark or a speech-bubble burger icon in the kiosk's teal), update every place it appears (kiosk, `/demo` cards, landing, deck assets via later steps), and note it in `docs/ISSUE.md`.
5. Prove nothing broke: the full unit and E2E suites, the touch hero spec still counts 24 taps (`e2e/kiosk-touch-efficient.spec.ts`), and before/after screenshots side by side in `phases/14-final/qa/kiosk-polish/`.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run qa:ui
```

## Verify
1. Run the AC commands; 0 H on kiosk screens.
2. Check: no real brands, logos or store photos; labels and flows unchanged (tests); images < the existing size limits.
3. Update this step in `phases/14-final/index.json`.

## Do not
- Do not change menu data, prices or flows (the touch count and the eval depend on them).
- Break existing tests.
