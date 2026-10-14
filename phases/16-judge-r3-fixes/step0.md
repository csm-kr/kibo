# Step 0: reply-language

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. The sections that matter: ARCHITECTURE "Text agent" and the `POST /api/chat` row, ARCHITECTURE "Voice", UX on the language picker, TESTING "Agent evaluation".
- `src/lib/agent/chat.ts` (`runChat`, `serverReply`, `screensLanguage`, `templated`, `budgeted`), `src/lib/agent/quickReply.ts` (`inScreensLanguage`, `plainRequest`, `summaryReply`), `src/lib/agent/instructions.ts` (the "## Language" rules and the `<current_order>` block), `src/lib/agent/live.ts` (`liveConnectConfig`, `inputAudioTranscription`, `liveCode`), `src/lib/agent/choices.ts` (`choiceQuestion`, `choiceLabel`, `declineLabel`, the `QUESTION`, `GROUP_QUESTION`, `TICKET_QUESTION`, `DECLINE`, `STAFF`, `YES_NO`, `VARIANT_LABEL` tables), `src/lib/i18n/languages.ts` (`LANGUAGES`, `lt`, the 9 AI languages), `src/components/phone/language.tsx` (`useAiText`, strings that follow an AI-only language), `src/components/phone/Choices.tsx`, `src/components/assistant/AssistantPanel.tsx` (`pickChoice`, `decline`, `say`).
- `scripts/eval-agent.ts` (turn kinds, the dine-tap turn, `replyIn`, `replyLanguage` in `scripts/grounding.ts`), `evals/agent-cases.json`.
- The round-3 judge report: `videos/orchestrator/judges-r3/REPORT.md` (git-ignored; read it if present). Problem 1 is this step.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
A fresh judge on production `kibo-00018-p7q` (10-15 morning) found that the AI leaves the user's language. "Your language" is a headline promise, and the primary persona is a Korean speaker aged 72.
1. **Korean voice on `/demo` (English screens, picker on English).** The cart was right, but the AI answered in English: "Added two Cheeseburger sets. Eat here or take out?".
2. **Choice tap in a Korean typed chat.** On English screens the [Cider] button sends the English word "Cider" as the user's message, and the next reply switched to English.
3. **Choice headers stay English** ("Would you like a dessert too?", "Which one would you like?") in a Japanese chat (picker on Japanese) and a Korean one.

The instructions already say "If the user speaks or writes in another language, reply in the language the user speaks or writes". The model does not keep to it once a turn gives it English words or the chosen language is English.

## Task (tests first for every logic change)
1. **The user's own language, decided on the server for text.** Add a pure function (for example `ownWordsLanguage` in `src/lib/agent/quickReply.ts` or a new small module next to it) that finds the language of the user's own words:
   - Use the current message. If the message is exactly a label of the open choice (`session.pendingChoice`, labels as the phone shows them with `choiceLabel` in the screens' locale, plus `declineLabel` and the staff label), it is a button tap: use the latest earlier user turn in `history` instead.
   - Decide by script only, without AI: Hangul is `ko`; any Hiragana or Katakana is `ja`; Han characters with no kana and no Hangul are `zh`; Thai is `th`. Anything else (Latin script, digits only, empty) returns null, and the model decides as now.
   - When the result is not null and differs from the AI language (`input.language ?? input.locale`), add one line to the `<current_order>` block, never to the system text (the system text is cached, 11-hardening:2): `Reply language: <English name> (the user's own words are in <English name>).`
   - The server's own sentences (`summaryReply`, `quickReply`, `introOffer`, the choice question at the end) exist in Korean and English. When that language is `ko` or `en`, use it for them instead of `input.locale`. Keep `budgeted` and `templated` correct for that language: a Korean message on English screens may now get the Korean summary or template.
   - Tests in `quickReply.test.ts` (or the new module's test) and `chat.test.ts`:
     - a Korean message on English screens gets the hint line;
     - a tap on [Cider] after a Korean turn gets the Korean hint;
     - a Latin-script message gets no hint;
     - the summary path answers in Korean for a Korean message on English screens.
2. **Voice (Gemini Live).** Make the Live system text say the chosen language is only the language to start in, and that from the user's first words the AI answers in the language of the user's latest words. Give `inputAudioTranscription.languageCodes` the chosen language plus `ko-KR` and `en-US` (no duplicates). First check in the installed `@google/genai` types that the field takes a list. If it does not, leave the transcription config as it is and say so in the summary. The relay builds its config with the same `liveConnectConfig`, so `voice-relay/` changes only if its tests need it.
   - Unit-test the config and the instruction text.
   - If `e2e/voice.live.spec.ts` can read the model's output transcription, add an assertion that the Korean hero (`hero-ko`) on English screens gets a reply containing Hangul. Run `npm run test:e2e:live` once. Real Gemini costs a few cents, which is fine. Report the result as it is, and do not rerun for a better one.
3. **Choice headers and fixed button labels follow the AI language** on the phone when the picker chose a language the screens do not have (the existing `useAiText` and `language.tsx` mechanism, and `lt` in `src/lib/i18n/languages.ts`).
   - Give `QUESTION`, `GROUP_QUESTION`, `TICKET_QUESTION`, `DECLINE`, `STAFF`, `YES_NO` and `VARIANT_LABEL` (or a phone-side twin of them) strings for every AI language in `LANGUAGES`. Write them yourself, short and plain.
   - Item and option names stay from menu data (`name.ko` / `name.en`); never translate them (CLAUDE.md rule).
   - The server keeps using the screens' locale for `pendingChoice` validation and labels in instructions. Only the phone's visible header and the fixed labels change.
   - Tests: a `ja` AI language shows a Japanese header for `upsell` and `pick_option` (drink), and a Japanese decline label.
4. **Eval cases** in `evals/agent-cases.json`, deterministic like the others:
   - `l-ko-on-en-tap` (screens `en`, no picker language): a Korean order that leads to a drink question, then a choice-tap turn that sends the English label, with `replyIn: "ko"` for every reply. Add a "choice tap" turn kind to `scripts/eval-agent.ts` if the dine tap does not cover it: it sends the label of a given choice id as the message.
   - `l-ko-voice-like-en` (screens `en`): a plain Korean order, `replyIn: "ko"`.
   - Run `npm run eval:agent -- <the new ids>` once with the production backend setting (`GEMINI_TEXT_BACKEND` unset, i.e. `auto`). Record the run file in `docs/plan/NUMBERS.md` under the list of runs; it is not the headline.
5. Docs: ARCHITECTURE (the hint line, the server sentences' language, Live language), UX (choice headers follow the AI language), `docs/ISSUE.md` (one row for the three findings, class `wrong-reply-language`; count the occurrence and add a rule to `docs/RULE.md` if this class reaches 3).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. AC commands pass. The new unit tests failed before the change (say so in the summary).
2. The eval run is saved under `evals/results/` and listed in NUMBERS.md.
3. Update this step in `phases/16-judge-r3-fixes/index.json` (completed + summary).

## Do not
- Do not detect language with a model call or a library. Script ranges only; Latin-script languages stay with the model.
- Do not put per-turn text in the system instructions (it breaks the context cache).
- Do not translate menu item or option names.
- Do not weaken the payment rules (`confirmCheckout` needs the tap or a new utterance; `paid` only from the kiosk).
- Do not tune instructions to single eval sentences.
