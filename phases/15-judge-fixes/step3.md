# Step 3: learn-clarity

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. UX (`/learn`), KIBO_LEARN, UI_GUIDE, RULE R-001 and R-014.
- `src/app/learn/*`, `src/components/learn/*` (or wherever the replay lives), `src/lib/learn/runs.ts`, `public/learn/*/run.json`, `src/app/page.tsx` (landing), `README.md`, `docs/plan/NUMBERS.md`, `spikes/blind-kiosks/ROUND4.md`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
- The same learner result appears four ways (landing "18 of 20 orders right", deck "16 of 20 hands-free, 2 handed to staff", video "eighteen of twenty right", `/learn` four cards "10 of 10"); judges cross-check and start doubting all numbers (UX judge #7, impact judge #5). In the product, 2 of the 18 stop and call staff because the skill's own total differed from the kiosk's (bk10 h1, h6), so 16 of 20 finish hands-free.
- `/learn` replay: action captions Korean only ("Tapped ✕ → 세트"), no tap marker on the screenshot, all-Korean learned-menu table, no autoplay; an English-only judge cannot follow it. The `/demo` pizza kiosk already draws a numbered tap dot.
- The landing is ~10 screens with repo paths under most claims.

## Task
1. One learner headline, word for word, from NUMBERS.md everywhere (landing, `/learn`, README, SUBMISSION if it quotes it): "On two kiosks it had never seen, KIBO finished 16 of 20 orders hands-free, handed 2 to staff and refused 2; none was wrong (round 4, synthetic kiosks)." with the all-rounds total one click away. Add the claim to NUMBERS.md with its evidence and every place it appears.
2. `/learn` replay: English gloss after each Korean label in action captions and the learned-menu table (`세트 (Set)`; translate with a small static glossary built from the run's own labels at publish time, or show the label plus its English name from the skill when it has one; never machine-translate at runtime), draw the tap position on the screenshot when the trace has it (same visual as the `/demo` tap dot), and start playback automatically at 4× with a visible Pause.
3. Landing: collapse repo file paths into a small "Sources" disclosure per section (links still there), keep the numbers and publisher names visible.
4. Tests for the glossary/tap transform; QA screenshots at 1440×900 and 390×844.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run qa:ui
```

## Verify
1. grep shows no other wording of the round-4 learner result on user-facing surfaces.
2. Update this step in `phases/15-judge-fixes/index.json`.

## Do not
- Do not swap or edit trace images (format conversion only).
- Do not drop the all-rounds totals or the failures.
