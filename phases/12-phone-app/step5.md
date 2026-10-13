# Step 5: two-device-e2e

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: TESTING "End to end", USER_JOURNEY J1 and J2.
- Code from steps 0–4: `src/app/app/**`, `src/app/kiosk/**`, `src/app/demo/**`, `e2e/helpers.ts`, `e2e/voice.live.spec.ts` (fake microphone pattern), `e2e/fixtures/*.wav`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Prove the full two-device flow in real browsers.
1. `e2e/two-device.spec.ts` (no model): browser A (1440×900) opens `/kiosk`; browser B (phone emulation, 390×844, a separate context) opens `/app`, then `/app/scan` with the QR fed in (fake camera if step 3 built it, else by reading the kiosk's `data-claim-url` and navigating as the scanner would after decoding); B claims; A's side panel shows "Phone connected"; B sends commands through the UI buttons where possible (dine option, an API-sent `addToCart` as the AI would, [Yes, pay now]); A shows the highlight, the review, payment; A taps the card; B shows the order number.
2. `@live` (skipped unless `E2E_LIVE=1`): the same with B's fake microphone playing `hero-ko.wav`: the kiosk in A fills with the hero lines by voice. Run `npm run test:e2e:live` once and record the result in the summary.
3. `docs/plan/OPERATIONS.md` and `README.md`: a short "Two-device demo" checklist for the team (laptop on `/kiosk` full screen, phone opens the camera or the KIBO app, allow camera and mic, talk), including what to do in KakaoTalk/NAVER browsers.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run test:e2e:live
```

## Verify
1. Run the AC commands (report live results honestly; a live failure that is not caused by this phase's code is logged, not hidden).
2. Update this step in `phases/12-phone-app/index.json` (completed + summary / error / blocked).

## Do not
- Do not mock the server or the session stream; two real browser contexts talk through the real API.
- Break existing tests.
