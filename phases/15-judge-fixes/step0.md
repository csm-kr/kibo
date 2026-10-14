# Step 0: agent-recovery

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. ARCHITECTURE "Text agent", TESTING "Agent evaluation".
- `src/lib/agent/chat.ts` (the round loop, `FALLBACK`, `quickReply` use), `src/lib/agent/quickReply.ts`, `src/lib/agent/instructions.ts` (or wherever the system instructions live), `src/lib/agent/tools.ts`, `scripts/eval-agent.ts`, `evals/agent-cases.json`, `scripts/grounding.ts`.
- The three round-2 judge reports summarized below (the files are git-ignored: `videos/orchestrator/judges-r2/{tech,impact,ux}/REPORT.md`; read them if present).

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
Three independent judges (10-14 night, production `kibo-00016-zj9`) saw the text agent stumble in ways a first-time user notices:
- A correct order (cart right by 10 s) was answered at 15.8 s with "Sorry, could you say that again?" (UX judge). An out-of-domain request also ended in that generic line after 11.5 s with no tool call (tech judge). The user will repeat the order and get it twice.
- Typed turns took 4.7–15.8 s (median 9.4 s, UX judge; 6.2 s tech judge).
- "Read back my whole order and the total" (low-vision persona) answered "cart empty, 0 won" while the AI's own question about a spicy chicken set's drink was still open (impact judge).
- "Add … one spicy chicken burger set, no sauce" silently dropped "no sauce" (the item has no such option).

## Task (tests first for every logic change)
1. **Never answer with the generic retry after something changed.** In `runChat`, when the model's final text is empty: if any tool call in this request succeeded, build the reply on the server from the applied actions (extend `quickReply` or add `summaryReply(kiosk, locale, actions)`: what was added/changed/removed, with item and option names from menu data, and the open question if the last tool was `offerChoices`); only when nothing happened and nothing was asked, answer with a helpful line that says what this kiosk sells and offers 2–3 real choices via the same `offerChoices` the model uses (data only, no invented items). `FALLBACK` stays only for a true failure path, and must never follow an applied change.
2. **Time budget per request.** After any round, if more than 12 s have passed since the request started and at least one tool was applied, stop calling the model and reply with the server-built summary. Make the budget a constant with a comment (why 12 s). Tests with a fake clock.
3. **Instructions** (keep them short; data only):
   - When reading back the order, also say any question you asked that is still open (e.g. "You still have to pick a drink for the Spicy chicken set").
   - When the user asks to remove or change something the item has no option for (e.g. "no sauce"), say so in one sentence instead of ignoring it.
4. **Eval cases** in `evals/agent-cases.json` (deterministic checks only, like the existing ones): applied-change-never-generic (an order whose model turn ends empty must not reply with the retry text), read-back-with-pending-question, unsupported-modifier-said, out-of-domain-gets-choices. Run `npm run eval:agent` once (Vertex locally; say so in the summary) and record the run file; do not rerun for a better number.
5. Update `docs/ARCHITECTURE.md` (text agent: summary reply, time budget) and `docs/plan/NUMBERS.md` (new eval run as the headline only if it is the newest full run; keep all runs listed).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. AC commands pass; the new unit tests failed before the change.
2. The eval run is saved under `evals/results/` and NUMBERS.md lists it.
3. Update this step in `phases/15-judge-fixes/index.json` (completed + summary).

## Do not
- Do not weaken the payment rules (`confirmCheckout` needs the tap or a new utterance; `paid` only from the kiosk).
- Do not let the summary reply mention anything not in the applied actions or the menu data.
- Do not tune instructions to single eval sentences.
