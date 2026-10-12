# Step 0: footage-capture

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: PRD "Demo scenario"; UX "Flow A", "Flow C"; RULE R-001.
- `docs/plan/SUBMISSION.md` (read it: the video storyboard 0:00–2:40), `.claude/skills/motion-demo-video/SKILL.md` (read it: how footage is used; real screens only, motion graphics never fake a feature).
- Code: `src/app/{demo,kiosk,assistant}/page.tsx`, `src/lib/demo/scenarios.ts`, `e2e/helpers.ts`, `e2e/*.spec.ts`, `playwright.config.ts`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Record clean screen footage of the real app for the demo video, so the editor never has to fake a screen.

### `scripts/capture-footage.ts` (`npm run capture:footage`, `tsx --env-file=.env`)
Starts the app (`npm run dev` on a free port with `STORE=memory`, or reuses `FOOTAGE_URL` when set, e.g. the deployed URL), then records with Playwright `recordVideo` (and a full-resolution screenshot at every key moment):
1. `demo-hero-1920x1080`: `/demo?k=malo` → Start → type the hero sentence (real Gemini) → kiosk fills → "Make both fries large" → "No thanks" → "I'll pay" → tap [Yes, pay now] → tap the card stand-in → order number. Type at a human pace (about 12 characters per second) and pause 1.5 s after each kiosk change so the edit has room.
2. `kiosk-touch-1080x1920`: `/kiosk?k=malo&demo=1` → the touch hero order (the same path as `e2e/kiosk-touch.spec.ts`), tap counter visible.
3. `kiosk-mirror-1080x1920`: `/kiosk?k=malo` while a phone (API with the claimed device token, `source: "voice"`) adds the hero lines → AI highlight and status line; then review, payment, order number.
4. `phone-390x844`: `/assistant` claimed from a kiosk session: the same order through `/api/chat` typed on the phone (real Gemini), confirm card, insert-card screen, order number.
5. `demo-airport-1920x1080` and `demo-pizza-1920x1080`: one scenario each from `scenariosFor` (stop before payment, then tap through).
Outputs go to `videos/footage/<YYYY-MM-DD>/` (git-ignored) with `manifest.json` (file, viewport, route, steps with timestamps in ms from the start, the model ids, the date). Write nothing else outside that folder. If a model call fails, retry that clip once, then record the failure in the manifest and continue.

### Notes for the editor
`videos/footage/README.md` is git-ignored with the rest; instead put a short `docs/plan/FOOTAGE.md` (committed): what each clip shows, how to re-record (`npm run capture:footage`, `FOOTAGE_URL=https://… npm run capture:footage` for the deployed app), and that phone footage on a real device (voice) is still needed for the hero shot and must be recorded by a person.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run capture:footage
```

## Verify
1. Run the AC commands; open the manifest and check every clip exists and has the expected duration (more than a few seconds).
2. Look at one screenshot per clip: no dev indicator, no error toasts, no test data that looks fake (lorem ipsum, "test").
3. Update this step in `phases/10-assets/index.json` (completed + summary / error / blocked).

## Do not
- Do not commit video files (size; `videos/` is git-ignored).
- Do not edit the app to look better only on camera; fix real issues or log them.
- Break existing tests.
