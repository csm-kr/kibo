# Step 3: qa

## Read first
- `CLAUDE.md` and `docs/*.md` are already in your prompt; do not re-read them.
- What this phase changed: `git diff --stat main...HEAD`, then the changed files; the step summaries in `phases/16-judge-r3-fixes/index.json`; `videos/orchestrator/judges-r3/REPORT.md` if present (git-ignored).

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
1. Run the QA pass in docs/UI_QA.md on the screens this phase changed. At least:
   - the phone's choice headers and buttons with the AI language on Japanese, Chinese and Spanish (P3 with an upsell and a drink question; 390×844 and 360×800 with larger text);
   - a Korean typed order on `/demo` (English screens) through a choice tap;
   - an allergy question that ends with [Call staff];
   - the landing page and `/learn` where numbers or wording changed.

   Save screenshots in phases/16-judge-r3-fixes/qa/. Fix H failures on these screens. Log everything else in docs/ISSUE.md following its "How to use".
2. Run `npm run test:e2e:live` once **without** `EVIDENCE=1`. Check with `git status` that no file under `evidence/` changed. If one did, step 2's guard is broken: fix it, restore the file, and log it.
3. **The headline eval, once.** Run `npm run eval:agent` (all cases) once on this final code with the production backend setting (`GEMINI_TEXT_BACKEND` unset = `auto`). It spends about USD 1 of the prepaid key, which is fine.
   - Make it the NUMBERS.md headline (the newest full run on the final code), with backend, model, date and commit.
   - Keep every earlier run listed. Do not rerun for a better number.
   - Update every surface that quotes the eval: README, landing, DECK_FACTS.md, and the description in `docs/plan/SUBMISSION.md`, keeping its character count test passing (≤ 1,024).
   - If a case fails, log it in ISSUE.md with the cause you can see.
4. Have a fresh-eyes agent re-walk the round-3 judge's problems 1, 2, 3, 5 and 6 and claims 1–9 (section 3 of the report) on a local production build, and mark each fixed / partly / not / needs a person, with screenshot paths.
5. Write phases/16-judge-r3-fixes/qa/REPORT.md: one line per angle A–I with pass/fail and issue ids, the judge items table, the eval result, and what a person still has to do.

## Acceptance criteria
```bash
npm run lint && npm run build && npm run test
npm run test:e2e
npm run qa:ui
npm run scan:repo
```

## Do not
- Change features or scope while fixing; only fix what breaks a written rule.
- Mark the step completed while an H rule fails on a changed screen.
- Commit any change under `evidence/` made by a test run.
