# Step 5: mic-test

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: ARCHITECTURE "Pages" (`/mic-test`, development only, not linked), "Voice" (iOS), UX "Accessibility" (in-app browsers), TESTING "End to end" (iOS checks); `docs/plan/SCHEDULE.md` (read it: the teammate runs `/mic-test` on iOS Safari and KakaoTalk/NAVER in-app browsers).
- Code: `src/hooks/useLiveVoice.ts`, `src/lib/voice/*`, `public/audio/pcm-recorder-worklet.js`, the in-app browser detection used by the phone UI.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
A small page the team opens on real phones to check microphone and audio behaviour before recording, without starting an order.

`/mic-test` (not linked from anywhere; `robots` noindex): shows the user agent family and whether it is an in-app browser; [Test microphone] (permission state before and after, a live level meter from the AudioWorklet, sample rate); [Test speaker] (plays a short generated tone through the same playback path at 24 kHz; reports whether the `AudioContext` started after the tap); "Permission remembered on reload?" instructions; a copyable one-line result summary (no audio is uploaded or stored). Phone layout rules apply (text ≥ 20px, targets ≥ 56px).

Also fix ISSUE I-128 first: `src/lib/agent/live.test.ts` reaches the network (class `unmocked-external-call`, I-006: a test must never reach the network); inject or mock every external client so `npm run test` passes with the network off, and mark it fixed.

Tests: a unit test for the in-app browser detector with sample user agents (KakaoTalk, NAVER, Instagram, Facebook, LINE, Safari, Chrome); an E2E with the fake media flags that the level meter moves and the result line appears.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
```

## Verify
1. Run the AC commands.
2. Check the page sends nothing to the server except loading itself.
3. Update this step in `phases/9-polish/index.json` (completed + summary / error / blocked).

## Do not
- Do not record, upload or store audio.
- Do not link the page from the product UI.
- Break existing tests.
