# Step 8: shots-final

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. UI_GUIDE, UI_QA "Visual standard".
- `scripts/capture-footage.ts`, `scripts/deck-shots.ts`, `scripts/landing-shots.ts`, `docs/plan/FOOTAGE.md`, `docs/plan/DECK_FACTS.md`; the current phone, pairing, `/learn` and learned-kiosk screens.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
1. Extend `scripts/capture-footage.ts` (keep existing clips): two-device (a 390×844 phone entering the 6-digit code shown on a 1440×900 landscape `/kiosk`, then a typed hero order, both recorded in sync), `/learn` replay at 16×, the learned kiosk with visible replay taps, the English kiosk subtitles, the tall one-QR laptop kiosk, and a short clip per AI language from step 4 (one sentence each on the same Korean kiosk, reply shown in that language).
2. Run `npm run shots:landing`, `npm run shots:deck`, `npm run capture:footage` against a **local production build** of this branch (the deployed URL may lag); at most 20 AI messages in total.
3. Open every still and list any with a bug, cut-off text, a loading state or old UI in `docs/plan/FOOTAGE.md`; retake those once; update DECK_FACTS picture paths.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. New pictures are newer than the UI commits of this phase; deck pictures < 600 KB.
2. Update this step in `phases/14-final/index.json`.

## Do not
- Do not commit `videos/` (git-ignored).
