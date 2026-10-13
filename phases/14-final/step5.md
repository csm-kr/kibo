# Step 5: fast-feel

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. ARCHITECTURE (agent loop, limits), TESTING, RULE R-001 and R-011.
- `docs/plan/judges/JUDGE_QA.md` row A5; `docs/plan/judges/tech/REPORT.md` (production typed latency 5.3–16.5 s, median 7.2 s, change 4); code: `src/lib/agent/chat.ts`, `model.ts`, `instructions.ts`, `src/app/api/chat/route.ts`, `scripts/eval-agent.ts`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
A typed turn took 7.2 s median (16.5 s max) on production; the kiosk change itself is applied in 26–36 ms. Most of the wait is the **second model round**: after the tools succeed, the model is called again only to write a short confirmation. "Faster than touch" is the product's promise.

## Task
1. Measure first: time each model round per request in the eval (`npm run eval:agent` records per-request and first-command times; add per-round timing if missing). Save the baseline.
2. **Skip the second round when it adds nothing:** when every tool call in a round succeeded and they are cart/dine/checkout commands whose result is fully described by the server (added/changed/removed lines, totals, the review opened), build the reply deterministically from the tool results and menu data in the user's locale (template per tool, no free text), and do not call the model again. Keep the model round when any call failed, a choice or staff call is involved, or the user asked a question. Tests first for the template builder (ko and en, grounded names only).
3. Optionally stream the reply text to the phone if the route can do it without changing the command path (skip if not trivial).
4. Measure again (one eval run on Vertex, the local backend; same cases): pass rate must not drop; report per-request median and p90 before/after in `evidence/fast-feel.json` and the TESTING ledger (R-001, R-011).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run eval:agent
```

## Verify
1. Run the AC commands; the evidence file exists with before/after.
2. Check: replies stay grounded in menu data; the payment rule is unchanged; no second-round skip after a failed call.
3. Update this step in `phases/14-final/index.json`.

## Do not
- Do not lower the eval bar or remove cases.
- Break existing tests.
