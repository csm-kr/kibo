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

## Orchestrator notes (10-14 10:00, from web research)
- **Privacy line, be exact:** do not write "no audio stored" unless the code proves it for KIBO's own servers, and do not imply Google keeps nothing: Gemini Live session resumption can keep session data up to 24 h (https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance). Check whether KIBO enables session resumption or any logging of audio or transcripts (`src/`, `voice-relay/`), then write what is true, e.g. "No account. KIBO keeps no audio and no personal data; the order session expires after N minutes. Speech is processed by Google Gemini under Google Cloud's data terms." Log the check in `docs/SECURITY.md`.
- **Prior art, never "first":** the "Why not …?" section must also name close prior art honestly: a Korean company (iCOMSYS) registered a patent in 2026-03 for a kiosk-support server where a customer scans a kiosk QR code and speaks through a phone call, and the server turns it into touch commands (https://www.etnews.com/20260318000063); voice kiosks that add a microphone and software to the kiosk (e.g. GoodGang Labs); barrier-free hardware kiosks; QR remote-control products that turn the phone into a touchpad (SiteKiosk Smart Kiosk Control); Gemini Live Guided Vision, which describes a screen but does not change the cart. Say what KIBO does differently in one line each (own phone and language; the kiosk's own cart changes through server-checked actions; the AI cannot pay, enforced by the server; KIBO Learn learns a web kiosk once and replays without AI with verified totals). Add these sources to `docs/plan/SOURCES.md`. Do not claim KIBO is the first or only one anywhere (grep the repo for "first", "only", "no one" in user-facing copy).
- **Law wording:** Digital Inclusion Act in force 2026-01-22; decree Art. 15 lets an operator provide one of several measures, including an assisting website or mobile app, if it gives equal access and use (https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1031828075). KIBO is "a type of measure the decree lists", never "makes a shop compliant". The Disability Discrimination Act kiosk duty is a separate statute with its own alternatives; do not merge the two.
- **Newer statistics you may add (each with its source line):** Seoul 2025 Digital Competence Survey (n = 5,500, Nov–Dec 2025, report 2026-06): among kiosk users aged 55+, 63.3% report inconvenience, 74.0% at 65–74 and 88.7% at 75+ (https://saif.or.kr/research-report/3042, printed pp. 58, 166–171; Seoul only, users only). Visitors: 18.94 million in 2025 (+15.7%), 15.05 million in Jan–Aug 2026 (+21.6%) (https://www.korea.kr/news/policyNewsView.do?newsId=148972696). Verify each page yourself before adding it to SOURCES.md.
