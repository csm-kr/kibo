# Step 6: stream-idle

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. ADR-010 (screens read the session only through the SSE stream), ARCHITECTURE "Limits and cost", UX (kiosk K1 attract, phone P-screens), UI_GUIDE, RULE R-001.
- Code: `src/app/api/session/[id]/events/route.ts` (+ test), `src/hooks/useSessionStream.ts`, its users (`src/hooks/{useKioskSession,usePhoneSession,useDemoSession}.ts`, `src/components/assistant/AssistantPanel.tsx`), `src/lib/limits/ip.ts` (`openStream`), `scripts/deploy.sh` and `scripts/deploy.test.ts`, `docs/plan/OPERATIONS.md`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
A cost check of the GCP project on 10-13 found that Cloud Run is billed as "active" almost all the time: SSE requests on `/api/session/<id>/events` stay open up to the 3,600 s request timeout and `EventSource` reconnects right away, so any forgotten `/kiosk` or `/demo` tab (or a background tab) keeps an instance busy. Active time costs about KRW 4,350 per instance per day versus about KRW 820 for an idle minimum instance, about KRW 110,000 until judging ends on 11-06 if nothing changes. Judges keep a tab open only for minutes; the screens must not hold the server when nobody looks at them.

## Task
1. **Hidden tabs:** in `useSessionStream`, when `document.visibilityState` is `hidden` for 60 s, close the `EventSource`; when the page is visible again, open a new one (the first frame is a full snapshot, so state catches up). State shows `connecting` while reopening; no visible flicker beyond the existing connecting state. Unit-test the hook's open/close logic with a fake `EventSource` and fake timers.
2. **Idle screens:** when a screen had no session change and no user input (pointer, key) for 20 min, close the stream and show a quiet full-screen "Paused · Tap to continue" layer (kiosk: Korean first, `일시정지됨 · 화면을 누르면 계속합니다`, with English below; phone and `/demo`: the UI language). The tap that dismisses it must not also press a button underneath. Resume reopens the stream. Use the existing design tokens (UI_GUIDE); respect reduced motion.
3. **Server cap:** the events route ends each stream cleanly after 15 min (send a final comment frame and close; release the per-IP stream place); `EventSource` reconnects by itself on visible, active screens. Test it with fake timers in the route test.
4. **Cloud Run timeout:** `scripts/deploy.sh` `--timeout 3600` → `--timeout 900` (must stay above the 15 min server cap so the server, not Cloud Run, ends the stream); update `scripts/deploy.test.ts` if it asserts flags, and note the change and the reason with the numbers above in `docs/plan/OPERATIONS.md` and ARCHITECTURE "Limits and cost".
5. Make sure the two-device flow and `/demo` still pass (`npm run test:e2e`), and that a paused kiosk resumes into the right screen with the cart intact.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
```

## Verify
1. Run the AC commands.
2. Check: no polling was added (ADR-010 stays: screens read only through the stream); a hidden tab holds no open stream after 60 s (assert in the hook test); the pause layer shows on K1/K3, the phone P3 and `/demo` D2 in a Playwright screenshot saved to `phases/12-phone-app/qa/`.
3. Update this step in `phases/12-phone-app/index.json` (completed + summary / error / blocked).

## Do not
- Do not change min/max instances, CPU or memory in `deploy.sh` (decided separately).
- Do not shorten the session TTLs or change what the stream sends.
- Break existing tests.
