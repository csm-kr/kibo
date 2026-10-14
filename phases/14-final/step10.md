# Step 10: qa

## Read first
- `CLAUDE.md` and `docs/*.md` are already in your prompt; do not re-read them.
- What this phase changed: `git diff --stat main...HEAD`, then the changed files; `docs/plan/judges/JUDGE_QA.md`, `docs/plan/NUMBERS.md`, `phases/14-final/REPO.md`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Task
Run the QA pass in docs/UI_QA.md on every screen this phase changed, plus the judge walks J3 and J1 and the two-device flow through the E2E suite, and `npm run test:e2e:live` once.
Have a fresh-eyes agent re-walk the JUDGE_QA rows owned by P14 (D1–D7, B4–B6, A5, A7, C4, C7, C9, E1, E2) and mark each fixed / partly / not, with screenshot paths.
Save screenshots in phases/14-final/qa/. Fix H failures on changed screens. Log everything else in docs/ISSUE.md.
Write phases/14-final/qa/REPORT.md: one line per angle A–I, the JUDGE_QA rows verified, and a "ready to submit" list of what a person still has to do (publish the repo, real-phone and real-user checks, video, deck on the official template, form).

## Acceptance criteria
```bash
npm run lint && npm run build && npm run test
npm run test:e2e
python3 design/prototype/e2e_check.py
npm run qa:ui
npm run scan:repo
```

## Do not
- Change features or scope while fixing; only fix what breaks a written rule.
- Mark the step completed while an H rule fails on a changed screen.

## Orchestrator notes (10-14 20:00, from KIBO Learn rounds 3–4)
- Over-refusal to fix in this step (test first): the product bridge's `isForbiddenLabel` (`src/lib/adapters/learned.ts`) refuses any label that merely *contains* a forbidden word, so with "주문하기" forbidden it also refuses a kiosk modal's "계속 주문하기" ("keep ordering"), which round 3 showed breaks orders mid-line on real-looking kiosks (I-193/I-194). Port the learner's whole-label / whole-word rule (`isForbidden` in `spikes/kibo-learn/plan.mjs`; I-234, R-016) with tests: real payment labels ("결제하기", "카드 결제", "주문하기" as the checkout button, "Pay") stay refused, choices that contain a refused word ("계속 주문하기", "곱빼기") are allowed. This must never let the bridge reach a payment control (the AI can never reach paid); if in doubt keep refusing. `e2e/learned.spec.ts` must still pass.
