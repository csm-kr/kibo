# Step 6: qa

## Read first
- `CLAUDE.md` and `docs/*.md` are already in your prompt; do not re-read them.
- What this phase changed: `git diff --stat main...HEAD`, then the changed files; the step summaries in `phases/15-judge-fixes/index.json`; the judge reports in `videos/orchestrator/judges-r2/` if present (git-ignored).

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Run the QA pass in docs/UI_QA.md on every screen this phase changed, plus: the pizza order-before-dine flow, the airport unknown-destination flow, the `/demo` card stand-in on the kiosk side, text size on `/assistant`, the small-phone choice visibility, and `/learn` autoplay with English glosses. Run `npm run test:e2e:live` once.
Have a fresh-eyes agent re-walk the round-2 judges' top problems (tech 1–5, impact 1–5, UX 1–7) on a local production build and mark each fixed / partly / not / needs a person, with screenshot paths.
Save screenshots in phases/15-judge-fixes/qa/. Fix H failures on changed screens. Log everything else in docs/ISSUE.md.
Write phases/15-judge-fixes/qa/REPORT.md: one line per angle A–I, the judge items table, and what a person still has to do.

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

## Orchestrator notes (10-15 00:40)
- Step 0's eval on Vertex scored 51/74 with 17 cases cut by the new 40 s per-call deadline (Vertex `global` is slow under load, I-157). Production's primary text path is the Gemini API key (auto mode); Vertex is only the fallback. For the final headline, run `npm run eval:agent` **once** on the final code with `GEMINI_TEXT_BACKEND=auto` (the production setting: the API key first, Vertex fallback; it spends about USD 1 of the prepaid key, which is fine), and record the conditions in NUMBERS.md (backend, model, date, revision of the code). Keep every earlier run listed with its cause; do not rerun for a better number.
- If the eval script runs cases in parallel, note the concurrency in NUMBERS.md; if Vertex fallbacks appear, say how many.
