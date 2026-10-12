# Step 5: qa

## Read first
- `CLAUDE.md` and `docs/*.md` are already in your prompt; do not re-read them.
- What this phase changed: `git diff --stat main...HEAD`, then the changed files.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Run the QA pass in docs/UI_QA.md on the screens this phase changed: **P2–P7, PX, D1, D2, D3, the root page `/`**, and the kiosk screens inside `/demo` at the scaled size.
Save screenshots in phases/3-assistant/qa/ (`npm run qa:ui` on branch `feat-3-assistant` writes there). Fix H failures on these screens.
Walk Flow A (text instead of voice), Flow C, and every phone row of UX "Exception flows" on the real screens, and journeys J1, J2 and **J3** (a cold judge on `/demo`: angle H). For angle H, write down what a judge sees in the first 20 seconds at 1440×900 and whether the three steps are obvious.
Check angle G carefully: the agent's replies may only name items from menu data (look at the latest `evals/results/*.json` tool calls and any failures), no real brands, no "Powered by AI".
Security spot checks: `/api/chat` with the kiosk token, with a tool turn in history, with 501 characters; `confirmCheckout` in the same chat request as `requestCheckout`.
Log everything else in docs/ISSUE.md following its "How to use".
If an H failure is out of scope or needs a decision: log it and set this step "blocked" with the issue id.
Write phases/3-assistant/qa/REPORT.md: one line per angle A–I with pass/fail and issue ids.

## Acceptance criteria
```bash
npm run lint && npm run build && npm run test
npm run test:e2e
python3 design/prototype/e2e_check.py
npm run qa:ui
```

## Do not
- Change features or scope while fixing; only fix what breaks a written rule.
- Mark the step completed while an H rule fails on a changed screen.
