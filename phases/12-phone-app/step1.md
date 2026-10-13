# Step 1: phone-redesign

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt; UI_GUIDE "Phone design" (step 0) is the spec.
- Step 0's tokens in `src/app/globals.css` and the preview components (`/design/phone`).
- Code: `src/components/assistant/*`, `src/app/assistant/*`, `src/components/demo/*` (the phone frame in `/demo`), `src/lib/i18n/phone.ts`, `e2e/qa/assistant.qa.spec.ts`, `e2e/qa/demo.qa.spec.ts`, `e2e/assistant.spec.ts`, `e2e/demo*.spec.ts`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Apply the phone design to every phone screen, in `/assistant` and inside `/demo` (they share `AssistantPanel`): P-start, P1 mic hint and in-app warning, P2 dine, P3 talk (empty, lines, choices, error, listening, thinking, speaking, reconnecting, voice fallback, noise hint), P4 confirm (and typing), P5 pay, P6 done, P7 ended/taken, PX overlays (idle warning, staff called, reconnecting), learned-kiosk states (pending, slow, mismatch, learned confirm), the ticket-machine wording. Keep behavior identical: same commands, same `source` values, same flows, same `aria-live` rules; only structure and style change. Keep `data-*` hooks the tests use, or update the tests in the same change.
- The bottom dock replaces the always-visible text input: the input opens from the keyboard button and stays open after the user typed once in this session; voice fallback opens it automatically (UX C3).
- `/demo`'s phone frame gets the same look; the "What the AI did" strip and the scenario guide keep their places.
- Remove the old styles that the new design replaces (no dead CSS or components).
Then run the QA suite and **look at every phone screenshot at 390×844 and 360×800**, comparing with `phases/9-polish/qa/` (before). Fix anything that breaks a rule or looks worse.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
npm run qa:ui
```

## Verify
1. Run the AC commands; 0 H on all phone states.
2. In the summary, list the screens changed and 2–3 before/after observations.
3. Update this step in `phases/12-phone-app/index.json` (completed + summary / error / blocked).

## Do not
- Do not change server behavior, commands or safety rules.
- Do not hide [Call staff], [Undo] or the total on any screen where they exist today.
- Break existing tests (update selectors only when the structure changed on purpose).
