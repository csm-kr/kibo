# Step 6: impact-content

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. PRD, USER_JOURNEY, SECURITY, RULE R-001.
- `docs/plan/judges/JUDGE_QA.md` (sections C and E), `docs/plan/judges/impact/REPORT.md`, `docs/plan/SOURCES.md` (sourced facts collected by the orchestrator with URLs and exact locations), `docs/plan/STRATEGY.md`, `src/app/page.tsx` (landing), `README.md`.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why
The impact judge scored Problem & Impact 5/10: no sourced statistic anywhere, a legal date in PRD that public sources contradict, no answer to "why not X", "who installs it", "what about privacy", "what about people without a smartphone".

## Task
1. **Sourced problem:** on the landing ("Who it is for") and in PRD, use only facts from `docs/plan/SOURCES.md`, each with a visible source line (publisher, year) and link. Remove or soften any claim the sources do not support (SOURCES.md lists them).
2. **Law:** correct PRD's kiosk-accessibility paragraph to what SOURCES.md says (dates, who is covered, the later revision allowing alternatives) and state why KIBO still helps (works on existing kiosks, no replacement).
3. **Landing sections (short, scannable):** "Why not …?" (barrier-free kiosk replacement / the shop's own mobile or QR ordering / Gemini Live with a camera on the kiosk / KIBO: works on the kiosk already there, no new hardware, the AI acts but cannot pay, one phone for every kiosk); "How KIBO gets onto a kiosk" (direct adapter; web kiosks: script tag, kiosk-browser extension or WebView injection; native: roadmap); "No smartphone?" (the kiosk keeps touch, large text and staff call; KIBO is optional); one privacy line (no account, no personal data, no audio stored, sessions expire after N minutes — take N from the code).
4. **Evidence links:** landing evidence paths become links to the public GitHub repo paths (use a `REPO_URL` constant; the repo will be public at `https://github.com/<owner>/kibo` — leave the owner as a single constant to fill in step 9); put the old café 2/5 and 3/5 in context or replace it with phase 13's final results.
5. QA screenshots of the changed landing sections at 1440×900 and 390×844.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run qa:ui
```

## Verify
1. Every new number on the landing has a source line and appears in SOURCES.md or an evidence file.
2. Update this step in `phases/14-final/index.json`.

## Do not
- Do not invent statistics, partnerships, pilots or prices.
- Break existing tests.
