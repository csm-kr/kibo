# Step 3: voice-e2e

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: TESTING "End to end", "Measurements" (latency (a) end of speech → first audio reply ≤ 2 s; (b) end of speech → kiosk highlight ≤ 3 s), "Evidence ledger"; RULE R-001; ARCHITECTURE "Voice" (decision test).
- Code: `src/hooks/useLiveVoice.ts`, `src/lib/voice/*`, `src/components/assistant/AssistantPanel.tsx`, `src/app/demo/page.tsx`, `playwright.config.ts`, `e2e/*.spec.ts`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
### First: fix I-072 (P1, grounding); step 0 of this phase did not get to it
The phase 3 QA probe got "Our warm Apple pie is very popular." from the text agent: "warm" is not in the data and Apple pie is not marked popular (`docs/ISSUE.md` I-072). Fix, test-first where it is code:
- `menuForModel` includes `badge` (best/new) so "popular" questions have a data answer (items with `badge: "best"`).
- `buildInstructions` adds explicit lines: describe items only with words from the menu data (name, options, price, kcal, allergens, badge); never add taste, temperature, origin, freshness or popularity words that the data does not state; "popular" or "recommended" means items with the `best` badge, and say so plainly ("The soft cone is marked as a best seller."); if asked for anything else about an item, say the kiosk does not have that information (and call staff only when the user needs it to decide).
- Add 4 eval cases to `evals/agent-cases.json` (ko and en: "What dessert do you recommend?", "What's popular?") with a new expectation kind `reply` checked by a **grounding checker** in `scripts/eval-agent.ts`: the reply may mention only item names that exist in the menu data and must not contain words from a small deny list (warm, hot and fresh, homemade, famous, delicious, signature, organic, 따뜻한, 인기 많은 unless the item has `best`…). Store only pass/fail and the matched words, never the reply text. Run `npm run eval:agent` and keep the overall pass rate; update the ledger row and mark I-072 fixed with the result file.


### Then: prove voice ordering end to end in a real browser with a synthetic voice, and measure latency.

### Voice fixtures: `scripts/make-voice-fixtures.ts` (`npm run fixtures:voice`, uses `tsx --env-file=.env`)
Generate WAV files (16-bit PCM mono, 16 kHz or 48 kHz, with 1 s of silence before and 2 s after the speech) with **Gemini TTS** (`gemini-3.8-flash-tts` via `@google/genai`, response modality AUDIO; it returns raw 24 kHz PCM: wrap it in a WAV header yourself). Sentences:
- `e2e/fixtures/hero-en.wav`: "Two cheeseburger sets. One without pickles. Drinks zero cola and cider."
- `e2e/fixtures/fries-en.wav`: "Make both fries large."
- `e2e/fixtures/hero-ko.wav`: "치즈버거 세트 두 개 주세요. 하나는 피클 빼고, 음료는 제로콜라랑 사이다로요."
Commit the WAV files (small, generated, no personal voice).

### Live E2E: `e2e/voice.live.spec.ts` (skipped unless `E2E_LIVE=1`; script `test:e2e:live` already exists)
Chromium launched with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>` (one browser per fixture; the fake device loops the file, so stop the mic after the first response). On `/demo`: [Start] → tap the mic → wait for the cart. Assert the hero cart (2 cheeseburger set lines with the right drinks and one without pickles) on both halves for `hero-en` and `hero-ko`. Record per run: time from the end of the speech in the file (known offset after connect) to the first AI audio chunk (a) and to the kiosk highlight (b). Make the timing hooks test-only (for example `window.__kiboVoiceTimings` set only when `?e2e=1`).
If the fake-audio route cannot work in this Chromium, fall back to driving the Live session with `sendClientContent` text from a test-only hook and say so in the summary and the evidence file (then it measures (b) only, not speech recognition).

### Evidence
Run `npm run test:e2e:live` three times. Save `evidence/voice-e2e.json` with each run's pass/fail and timings, the median of (a) and (b), the model id and the date. Update the `docs/TESTING.md` ledger rows "Latency (a)(b)" (measured, file path, "synthetic TTS voice on a laptop, not a real phone"). If (b) is over 3 s, log it in `docs/ISSUE.md`.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run eval:agent
npm run test:e2e:live
```

## Verify
1. Run the AC commands; the live run must pass at least 2 of 3 times for each fixture (report all results).
2. Check the evidence file has no tokens, transcripts of anything but the fixture sentences, or keys.
3. Update this step in `phases/4-voice/index.json` (completed + summary / error / blocked).

## Do not
- Do not record or commit any real person's voice.
- Do not count a text-driven run as a voice measurement.
- Do not publish a latency number without its evidence file (R-001).
- Break existing tests.
