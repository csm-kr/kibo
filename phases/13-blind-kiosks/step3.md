# Step 3: learner-gaps

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. KIBO_LEARN ("Known gaps"), ADR-007 (no runtime self-healing; learn once, replay without AI), SECURITY "Learned kiosks".
- `spikes/blind-kiosks/PROTOCOL.md` ("Developer" role: dev set only), `spikes/blind-kiosks/results/BASELINE.md` (the failure **patterns**).
- Learner code: `spikes/kibo-learn/{learner,driver,runner,audit}.mjs`, `test_audit.mjs`; the product bridge that replays skills in the browser: `src/lib/bridge/*` and `src/lib/adapters/learned.ts` (the skill format must stay compatible, or both sides change together with tests).

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Rules for this step (fairness)
- Work only against the **dev set**: Doughhouse (`spikes/kibo-learn/kiosk/index.html`) and Gureum Darak Coffee (`spikes/blind-kiosk/app/`). You may build **small new synthetic fixtures** under `spikes/kibo-learn/fixtures/patterns/` that reproduce a failure pattern from BASELINE.md (for example a quantity stepper option, a wizard with "다음", a conditional group, a pager, icon-only tabs with `aria-label`, a native `alert()`), written from the pattern description, **not** copied from the four test kiosks.
- Do not open the four test kiosks' `app/`, `answer-key.json` or `BRIEF.md` in this step. Do not add rules that name their items or labels.

## Task
For each failure pattern in BASELINE.md, in order of how many kiosks it affected:
1. Make a minimal fixture that shows it, and an AI-free regression test (runner/audit level, `node --test` or the existing test scripts) that fails today.
2. Fix it in the learner's tools, prompt, skill format or runner (examples: a `quantity` option type with `{ op: "repeat" }` on a stepper; a lint that rejects navigation words like 다음/이전/확인 and bare symbols as option names; conditional groups recorded with `appliesWhen`; pager following in snapshots; `aria-label`-only controls as labels; dismissing native alerts with their text in the snapshot). Keep the finish gate (≥ 3 self-tests + coverage audit) and add checks if a pattern needs one.
3. Keep the product bridge in step: if the skill format changes, update `src/lib/adapters/learned.ts`, `skills/doughhouse.json` stays valid, and `src/lib/bridge/*` replays the new ops, with unit tests.
4. Re-run the learner on the dev set (Doughhouse and Gureum once each, Gemini, 2M cap) to show no regression; save under `spikes/blind-kiosks/results/dev/`.
Record every change in `spikes/kibo-learn/CHANGES.md` with the pattern it addresses.

### Learning trace (for the `/learn` viewer in step 6)
Add an opt-in trace to the learner: with `TRACE_DIR=<dir>`, after every turn save `turn-<n>.json` (`{ n, at, tool, args (labels and ids only; no prompts, no model reasoning text, no tokens or keys), resultSummary (one line: e.g. "opened 페퍼로니: 3 option groups", "recorded item 마르게리따", "testSkill 3/3 passed", "audit ok"), discoveries so far { items, optionGroups, categories }, inputTokens, outputTokens }`) and a screenshot `turn-<n>.jpg` of the kiosk viewport (JPEG, 720px wide, quality ~70). Also `trace.json` with the run's header (kiosk id, model, start/end, gate results). The trace must not change the learner's behavior; test it on a dev fixture.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run test:e2e
```
plus the learner regression tests you added (list the commands in the summary).

## Verify
1. Run the AC commands and the new regression tests.
2. The dev-set re-runs exist and did not get worse than their previous results (Doughhouse run3, Gureum v3 runs); if one did, say so plainly.
3. Update this step in `phases/13-blind-kiosks/index.json` (completed + summary / error / blocked).

## Do not
- Do not look at the test kiosks (fairness).
- Do not add runtime AI to the replay.
- Break existing tests.
