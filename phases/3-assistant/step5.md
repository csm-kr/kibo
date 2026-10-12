# Step 5: agent-eval

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: TESTING "Agent evaluation set", "Evidence ledger"; RULE R-001; PRD "Covering real kiosk complexity"; ARCHITECTURE "Agent tools (9)".
- Code: `src/lib/agent/*` (instructions, tools, mapping, chat, model), `src/lib/session/service.ts`, `src/lib/store/memory.ts`, `data/kiosks/malo.json`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
A repeatable evaluation of the text agent against real Gemini, saved as evidence, and up to three rounds of instruction tuning.

### Cases: `evals/agent-cases.json`
About 20 cases in Korean and English (both languages in every type where it makes sense), grouped by TESTING types 1–6, 8, 9 (type 7 needs the learned Doughhouse kiosk: list it as "not covered yet"). Each case: `{ id, type, locale, turns: [user messages], expect }` where `expect` is one of:
- `cart`: the exact final cart as `[{ itemId, variant, qty, selections }]` (order-insensitive; defaults count, e.g. side `fries_m`);
- `choices`: `pendingChoice` is set with the given `templateId` and includes the given ids, and the cart is unchanged;
- `staff`: `staffCalled.reasonCode` is `unknown_info` and the cart is unchanged;
- `refuse`: the cart is unchanged and no tool call failed with `BAD_REQUEST` (unknown items are refused in words, not by inventing ids);
- `status`: e.g. `confirming` after "I'll pay" (and never `paying` from one message).
Include the PRD hero sentence, "make both fries large" as a second turn (`updateCart`, no new lines), "one burger" (pick_item), a set without a drink (pick_option drink), shrimp burger (sold out → alternatives), a morning item when the eval clock is 14:00 KST (unavailable), "Is this halal?" (staff), an item that does not exist ("a pepperoni pizza", refuse), "no, cancel that" after an add (undo), Korean variants of these.

### Runner: `scripts/eval-agent.ts`, `npm run eval:agent`
- `npm install -D tsx`; script `"eval:agent": "tsx --env-file=.env scripts/eval-agent.ts"`.
- Runs every case in-process with a fresh `MemoryStore` demo session per case, the real `geminiClient()`, a fixed clock of 14:00 KST for availability (but real time for the 1.5 s confirm wait), and `runChat` exactly as the route does. Sequential, with a short pause between calls to stay under the per-minute quota; one retry on `RATE_LIMITED`.
- Writes `evals/results/<YYYY-MM-DDTHH-mm>.json` (per case: pass/fail, final cart ids, pendingChoice, staffCalled, tool call names and result codes, latency ms; **no reply text and no key**) and `evals/results/<same>.md` with the pass rate per type and overall, the model id, and the date.
- Exits 0 even when cases fail (it is a measurement); exits 1 only on a crash or a missing key.

### Tune (at most 3 rounds)
Run the eval. If a type fails, improve `buildInstructions` or tool descriptions (not the cases, not the server rules), re-run, and keep every result file. Stop after 3 rounds or at ≥ 90% overall. Unit tests must still pass after each change.

### Evidence
Update the `docs/TESTING.md` evidence ledger row "Agent evaluation pass rate" with the final value, the model id and the result file path, marked "measured" (R-001: the number must point to its file). Mention in the row that the cases were written by the team (not an external benchmark).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run eval:agent
```

## Verify
1. Run the AC commands; the eval must complete and write its files.
2. Check the result files contain no utterance replies, tokens or keys.
3. Update this step in `phases/3-assistant/index.json` (completed + summary with the final pass rate / error / blocked; if the key is missing or rejected, blocked with the reason).

## Do not
- Do not change server validation or the state machine to make cases pass; the agent must work within the rules.
- Do not edit expected results after seeing the model's output unless the expectation was wrong by the PRD or menu data (say which in the summary).
- Do not publish a number without its result file (R-001).
- Break existing tests.
