# Step 2: voice-ui

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: UX "Flow A" A3 and A5, "Flow C" C3, "Exception flows" (noise, phone disconnected), "Screen map" P1 and PX, "Accessibility" (in-app browsers, voice replies can be turned off, aria-live suppressed while the AI speaks); UI_GUIDE "Motion" (listening pulse) and phone colors; UI_QA "Visual standard" (mic ≥ 88px; motion rule: a status indicator runs only while its state lasts and is static under reduced motion).
- Code: `src/hooks/useLiveVoice.ts`, `src/lib/voice/*`, `src/components/assistant/AssistantPanel.tsx`, `src/app/assistant/page.tsx`, `src/app/demo/page.tsx`, `src/components/demo/*`, `src/lib/i18n/phone.ts`, `e2e/qa/*`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Put voice into the phone and `/demo` UI, with text as the automatic fallback.

### Phone (`AssistantPanel`)
- **P1 microphone hint** (first time per browser, before the browser prompt): a picture-style hint "Tap **Allow** on the next screen" and [Turn on the microphone] (calls `start()` inside the tap) plus "Type instead". Denied or missing mic → text mode with one plain sentence.
- **Mic button** in the P3 slot: one large round button ≥ 88px in KIBO blue with an icon **and** a text label that names the state: "Tap to talk", "Connecting…", "Listening…", "Thinking…", "Speaking…", "Reconnecting…". A listening pulse that runs only while listening and is static under `prefers-reduced-motion`. Tap while active stops.
- Show what it heard (`onUserText`) and the AI's words (`onAiText`) in the conversation (last two messages large); the AI's audio and its text say the same thing.
- **Voice output switch** ("AI voice on/off"): off → no audio, text only; when off, cart changes are announced with `aria-live`; when on, the announcement is suppressed while the AI speaks.
- **Fallback:** `onFallback(reason)` → show the reason in plain words, focus the text input, keep the conversation. After two "didn't catch that" turns, suggest typing or the buttons (UX "Noise").
- Voice time left for demo sessions shown when under 60 s.
- **In-app browsers** (KakaoTalk, NAVER, Instagram, Facebook, LINE user agents): a banner "Microphones often don't work in this app. Open in Safari or Chrome." with a copy-link button; text still works.
- Choice-button taps during voice: send the label as user text through `sendClientContent` on the open Live session (one utterance) instead of `/api/chat`.

### `/demo`
- The assistant column gets the same mic button. If the browser has no microphone, permission is denied, or Live fails, text input comes forward automatically (C3) with one sentence, and examples stay tappable.
- [Try again] and `paid` stop the Live session.

### UI QA
Extend `e2e/qa/assistant.qa.spec.ts` and `e2e/qa/demo.qa.spec.ts` with P1 and the mic button states you can reach without a real model (use Playwright's fake media flags `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` in the QA config and a mocked `/api/live-token` route that returns 429 to exercise the fallback). Check the mic button size, label and focus ring, and that the pulse stops under reduced motion.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run qa:ui
```

## Verify
1. Run the AC commands; fix H failures on P1, P3 and D2.
2. Check: the mic button has text, not only an icon; color is not the only state signal; fallback leaves the user with a working text input.
3. Update this step in `phases/4-voice/index.json` (completed + summary / error / blocked).

## Do not
- Do not start the microphone without a user tap.
- Do not show technical words (token, session, Live) in the UI.
- Do not add decorative animation; only the listening pulse and state changes.
- Break existing tests.
