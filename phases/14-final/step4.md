# Step 4: any-language

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. PRD (who it is for), USER_JOURNEY J1 and J2, TESTING "Agent evaluation set", RULE R-001.
- `docs/plan/judges/JUDGE_QA.md` rows C7 and C8; `docs/plan/judges/impact/REPORT.md` (the "not spicy for my grandson" call went to staff although the menu marks spicy items); code: `src/lib/agent/instructions.ts`, `evals/agent-cases.json`, `scripts/eval-agent.ts`, `scripts/grounding.ts`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
The owner (10-14): "the video only emphasizes Korean, but the strength is that Gemini covers any language." The phone must let a visitor speak and read the AI in their own language while the kiosk stays Korean. Also: all eval cases are clean sentences written by the team. Older users speak vaguely and colloquially; when the menu data can answer (an item named "Spicy …", categories, sizes), KIBO should offer choices from the data instead of calling staff.

## Task
1. Add 12 eval cases (Korean and English, labelled "colloquial, team-written") such as "something not spicy for my grandson", "the usual burger with a drink", "a small one, not too much", "그거 매운 거 말고 순한 거", "애들 먹을 거 하나", "제일 많이 팔리는 거" (only if the data has a best-seller flag; else expect an honest answer), mixed Korean/English, and one with a mishearing. Expected: choice buttons from data, a grounded question, or a correct add; staff only when the data cannot answer.
2. Adjust the instructions minimally so data-answerable questions get choices (with prices) instead of a staff call; keep the grounding rule (names only from data).
3. **Any language (the main task of this step):**
   - Read the official Gemini Live API documentation for its supported speech languages and record the list, URL and read date in `docs/plan/SOURCES.md` (R-001); claim only that list.
   - Phone: a language picker with Korean and English UI plus "AI language" choices for at least 日本語, 中文(简体), Español, Tiếng Việt, Français, ไทย, Bahasa Indonesia (more if cheap). Choosing one sets the Live transcription language code and tells the agent to speak and write in that language; the UI chrome stays English for those (translate only the handful of strings a first-time user must read: the mic label, the confirm card buttons, "insert your card into the kiosk", order number) and the cart keeps menu names in Korean with the English name under them.
   - Text path: reply in the language the user writes in, whatever the picker says.
   - Kiosk subtitles stay English; menu names always come from data (grounding unchanged).
   - Eval: add 2 cases per new language (text), expecting correct tool calls and a reply in that language (check the reply language with a simple script, no AI).
4. **Voice bug seen in the video capture (10-13, 2 of 2 takes):** on Gemini Live the AI asked "Eat here or take out?" although the dine option was already chosen on the phone. Check what the Live instructions/session context say about the dine option at token or relay setup and after `setDineOption` (the pinned config is built once per connection), fix it so the voice agent never asks for something the session already has, and add a unit test on the built instructions; if a live re-check is cheap, run one `@live` voice case.
5. Run `npm run eval:agent` once (Vertex, local backend): report old cases and new cases separately; no regression on old cases.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run eval:agent
```

## Verify
1. Run the AC commands; results file saved; TESTING ledger row added (R-001).
2. Update this step in `phases/14-final/index.json`.

## Do not
- Do not tune instructions to individual eval sentences.
- Break existing tests.

## Orchestrator notes (10-14 10:00, from web research)
- Voice runs on two paths (`GEMINI_LIVE_BACKEND=auto`): the Gemini Developer API key path first, the Vertex AI relay (`kibo-voice`, `us-central1`) when the key cannot pay (ADR-012). Their language lists differ: the Developer API Live guide lists 99 languages (https://ai.google.dev/gemini-api/docs/live-guide), while the Cloud page lists 24 for Vertex AI Live (https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api/configure-language-voice). Read both pages, record in `docs/plan/SOURCES.md` which of our picker languages are on each list (with the date read), and offer a language in the picker only if it is on both lists or if the picker says plainly which path supports it. Never write "99 languages" as a KIBO claim; the deck and video quote only the tested list.
- The model in production is `gemini-3.8-live` (voice) and `gemini-3.8-flash` (text); name the exact model ids and regions wherever languages are claimed.
- **Fix found by the orchestrator in step 2's shots (do it here, before step 8 captures):** on the MALO kiosk in English (`phases/14-final/qa/kiosk-polish/after/kiosk-K3-menu-en-1080x1920.png`) tile names break inside a word: "Cheeseburge / r", "Double cheeseburge / r". Long English names must wrap only between words (no `word-break: break-all`/`anywhere` on Latin text; keep `keep-all` for Korean) and fit: step the tile name size down for long Latin names or allow two lines at a smaller size. Check every MALO and airport English screen at 1080×1920 and in the `/demo` and two-device frames; add a QA check that no rendered word is split across lines on kiosk tiles. Log it in `docs/ISSUE.md`.
