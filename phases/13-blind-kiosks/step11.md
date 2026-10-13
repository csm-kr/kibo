# Step 11: qa

## Read first
- `CLAUDE.md` and `docs/*.md` are already in your prompt; do not re-read them.
- What this phase changed: `git diff --stat main...HEAD`, then the changed files; `spikes/blind-kiosks/RESULTS.md`, `PROTOCOL.md`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Run the QA pass in docs/UI_QA.md on what this phase changed: `/learn` and `/learn/[runId]` (step 9) at their viewports, the new links on the landing page and `/demo`, and product screens if step 10 added a learned kiosk or a landing line (then QA those screens with `npm run qa:ui` on branch `feat-13-blind-kiosks`, fix H failures); otherwise angles A–F n/a.
Focus on angle G and R-001: every number in RESULTS.md, KIBO_LEARN, TESTING, DECK_FACTS, README and the landing page matches its file; unsafe outcomes are stated wherever results are quoted; no claim beyond the evidence ("any kiosk", "always").
Fairness audit: check the git history of this phase that no learner change (step 4) touched or referenced the four test kiosks' apps, answer keys or briefs (search the diffs and commit times), and that the final runs used the learner version committed before them. Write the finding in the report.
No real brands in the new kiosks (search their apps and answer keys for common brand names).
Log everything else in docs/ISSUE.md following its "How to use".
Write phases/13-blind-kiosks/qa/REPORT.md: one line per angle A–I with pass/fail/n/a and issue ids, plus "Fairness audit".

## Acceptance criteria
```bash
npm run lint && npm run build && npm run test
npm run test:e2e
python3 design/prototype/e2e_check.py
```

## Do not
- Change features or scope while fixing; only fix what breaks a written rule.
