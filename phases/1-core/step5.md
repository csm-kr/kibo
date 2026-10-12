# Step 5: qa

## Read first
- `CLAUDE.md` and `docs/*.md` are already in your prompt; do not re-read them.
- What this phase changed: `git diff --stat main...HEAD`, then the changed files.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Run the QA pass in docs/UI_QA.md on what this phase changed. **This phase built no screens** (menu data, cart engine, state machine, store, API routes), so:
- Angles A, B, D, F, H: write "n/a: no screens in this phase" in the report.
- Angle C (flows) and E (Nielsen): check that the API and state machine make every flow and exception row in `docs/UX.md` possible (Flow A, B, C; misheard → undo, ambiguous → choices, sold out → alternatives, not in data → staff, someone else scans → CONFLICT message, change of mind at payment → editOrder). List any row the server cannot support yet.
- Angle G (content): menu data has no real brands, no health or religious claims, names ≤ 40 chars, prices from data only; error messages are plain words without ids.
- Angle I (rules): `docs/RULE.md` R-001 on any numbers added to docs.
- **Contract drift:** compare the code with ARCHITECTURE (routes, request/response shapes, error codes and statuses, command/actor table, state rules, session fields) and SECURITY (tokens hashed, constant-time compare, secrets never sent, no logging of bodies or tokens, per-IP limit on the last `X-Forwarded-For` hop). Fix code that breaks a written rule; if the doc is wrong or silent, fix the doc only when the code follows an explicit phase step, otherwise log it.
- Security spot checks with tests or a script: forged `cardAction` with a device token, `confirmCheckout` without `confirming`, an option id from another item, a 1,000-character id, a 70 KB body. Each must be refused with the documented code.

Save notes in `phases/1-core/qa/`. Fix H failures and rule violations in scope. Log everything else in `docs/ISSUE.md` following its "How to use" (reuse classes; the 3rd occurrence of a class adds a rule to `docs/RULE.md`).
If an H failure or P0 is out of scope or needs a decision: log it and set this step "blocked" with the issue id.
Write `phases/1-core/qa/REPORT.md`: one line per angle A–I with pass / fail / n/a and issue ids, then a "Contract drift" section and a "Security spot checks" section.

## Acceptance criteria
```bash
npm run lint && npm run build && npm run test
python3 design/prototype/e2e_check.py
```

## Do not
- Change features or scope while fixing; only fix what breaks a written rule.
- Mark the step completed while a P0 or a security spot check fails.
