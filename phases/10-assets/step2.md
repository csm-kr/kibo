# Step 2: qa

## Read first
- `CLAUDE.md` and `docs/*.md` are already in your prompt; do not re-read them.
- What this phase changed: `git diff --stat main...HEAD`, then the changed files; `videos/footage/*/manifest.json`; `docs/assets/deck/`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Run the QA pass in docs/UI_QA.md on what this phase changed. No product screens changed, so angles A–F apply only if a fix touched a screen; focus on:
- Angle G and R-001 across `docs/plan/SUBMISSION.md` (description), `docs/plan/DECK_FACTS.md`, `docs/plan/FOOTAGE.md`: every number has a source; no brands; no OpenAI claims for the product; no legal-compliance claims; the description is ≤ 1,024 characters.
- The deck PNGs and footage stills: real screens, no dev indicator, no error states, no placeholder text; each looks right at slide size.
- Angle H: would a judge who sees only the deck screenshots understand the flow (phone talk → kiosk fills → confirm → pay)?
Log findings in docs/ISSUE.md following its "How to use".
Write phases/10-assets/qa/REPORT.md: one line per angle A–I with pass/fail/n/a and issue ids.

## Acceptance criteria
```bash
npm run lint && npm run build && npm run test
python3 design/prototype/e2e_check.py
```

## Do not
- Change features or scope while fixing; only fix what breaks a written rule.
