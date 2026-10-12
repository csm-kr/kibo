# Step 0: core-fixes

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: ISSUE I-029, I-030, I-031 (decisions below); ARCHITECTURE "Commands and actors" (`confirmCheckout`), "sessions/{sessionId}" (`metrics`); RULE R-002.
- `src/lib/commands/machine.ts` and `machine.test.ts`, `src/lib/commands/errors.ts`, `phases/1-core/qa/REPORT.md`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Apply three decisions made on 10-12 by the orchestrating session (the user delegated decisions). **Tests first** for the code change.

### I-029: AI confirm needs a review the phone's AI opened (Option A)
- `confirmCheckout` from the phone with `source` other than `"button"` is accepted only when `checkoutUtteranceSeq` is not null, `utteranceSeq > checkoutUtteranceSeq`, and 1.5 s have passed since `checkoutAt`.
- `requestCheckout` from the **kiosk** sets `checkoutUtteranceSeq = null`; `editOrder` sets `checkoutUtteranceSeq = null` (and `checkoutAt = now`). So after a kiosk-opened review or an edit, the phone user must tap [Yes, pay now] (the AI's confirm returns `CONFLICT` "Please confirm on the card.", and the agent tells the user to tap the card).
- Update the existing test that expected the old `editOrder` behaviour; add tests for both paths (AI confirm refused, button confirm accepted).
- Update ARCHITECTURE "Commands and actors" (`confirmCheckout` row and the `utteranceSeq` note) and SECURITY "Command handling" with the same sentence (R-002: grep `docs/` and `phases/` for `checkoutUtteranceSeq` and `confirmCheckout` and make every copy agree). Mark I-029 fixed with how.

### I-031: error copy on screens
Decision: the server keeps plain English `message` (for the AI, logs and as a fallback); screens show their own localized copy chosen by `error.code` (and `detail.templateId` where it helps). Add `src/lib/i18n/errors.ts`: `errorCopy(code, locale, detail?) → string` with ko and en for every `ErrorCode` plus `NETWORK` (client-side), plain words that say what happened and what to do (UX heuristic 9; no codes shown). Unit-test that every code has both languages. Note the decision in ARCHITECTURE "Common rules" (one line) and mark I-031 fixed. The kiosk (Korean) and the phone (ko/en) use `errorCopy`; the agent keeps reading the English `message`.

### I-030: `metrics`
Decision: remove the `metrics` row from the ARCHITECTURE sessions table; touch-vs-voice counts come from the demo counters and E2E evidence files (`docs/TESTING.md`). Mark I-030 fixed.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. Run the AC commands.
2. `grep -rn "checkoutUtteranceSeq" docs/ phases/` agrees with the code (R-002).
3. Update this step in `phases/2-kiosk/index.json` (completed + summary / error / blocked).

## Do not
- Do not loosen any other confirm rule; `paid` still needs the kiosk's `cardAction`.
- Do not translate server messages on the server.
- Break existing tests.
