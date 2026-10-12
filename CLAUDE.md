# Project: KIBO (Kiosk Intelligence Bridge & Operator)

Talk to your phone, and an existing self-order kiosk places the order. Built for the Google Cloud AI Builder Cup 2026 (submission 2026-10-17, judging until 2026-11-06).

Read first: `docs/RULE.md` (rules from repeated mistakes) and `docs/ISSUE.md` (known issues), then `docs/PRD.md` (problem, scope, demo), `docs/UX.md` (flows, screen map, heuristics), `docs/USER_JOURNEY.md` (journeys per persona), `docs/ARCHITECTURE.md` (API, database, tools, voice, limits), `docs/ADR.md` (decisions), `docs/SECURITY.md` (controls the code must have), `docs/UI_GUIDE.md` (look, components), `docs/UI_QA.md` (UI checklist and QA pass), `docs/KIBO_LEARN.md`, `docs/TESTING.md`. Strategy, schedule, submission and operations notes are in `docs/plan/`. The prototype in `design/prototype/` shows the intended screens and flows.

## Stack
- Next.js (App Router), TypeScript strict, Tailwind CSS
- Cloud Run (`asia-northeast3`), Firestore, Secret Manager
- Gemini Live (voice, function calling) and Gemini Flash (text agent); Vertex AI for the offline learner
- Playwright (KIBO Learn), Vitest (unit), Playwright Test (E2E)

## Rules and the reasons behind them
- The product uses Gemini for all AI features. The hackathon requires Gemini/Google AI, and the judges score Google AI usage at 40%. OpenAI may only be used offline: learner experiments (`PROVIDER=openai`) and Codex image generation for design assets. Never in `src/`.
- Every state change goes through `POST /api/command` with a `commandId`, an actor token and zod-validated arguments, applied in a Firestore transaction. Clients only read the session, through the server's SSE stream (ADR-010). Tool arguments come from the browser, so the server is the only place that can be trusted.
- The AI can open the confirm card but cannot complete a payment: `confirmCheckout` needs `confirming` state, a matching `cartVersion`, and either a tap on the confirm card or a fresh user utterance; `paid` needs the kiosk's card action. This is the product's main safety promise.
- Names, prices and options come only from menu data (`data/kiosks/*.json`, `skills/*.json`). Promotions, suggestions and AI replies must not mention items that are not in the data.
- No real brands, logos, menu photos or store screens. Third-party IP disqualifies the entry.
- Never print, log or commit secrets. Keys live in `.env` (git-ignored) or Secret Manager.
- Everything in the repo is in English (rules require it). Korean is allowed only as UI strings on the kiosk and in user-facing copy.
- Deploy with an explicit `--region asia-northeast3`; the local gcloud default points elsewhere.

## Scope
Do only what the current task or step asks. Do not add features, refactors or "improvements" beyond it, and do not add abstractions for a single use. If something looks wrong outside the task, mention it instead of changing it.

## Issues and rules
Sessions do not remember each other, so mistakes are written down.
- Before a task, read `docs/RULE.md` and the open issues in `docs/ISSUE.md` for the area you touch.
- Log every bug, doc mismatch, UI violation or own mistake in `docs/ISSUE.md`, following its "How to use" (reuse classes; count only new occurrences).
- When a class reaches 3 occurrences, add a rule to `docs/RULE.md`. Rules bind like this file.

## Development process
- Logic (commands, state machine, validation, adapters, limits, learner): write the failing test first, then the code, then run the tests.
- UI tweaks, config and docs do not need test-first.
- Any UI change or polish: read `docs/UI_GUIDE.md`, `docs/UX.md` (flows, screen map), `docs/USER_JOURNEY.md` and `docs/UI_QA.md` first; afterwards run the QA pass in `docs/UI_QA.md` and log findings in `docs/ISSUE.md`. Judges see the UI first, so an unchecked screen is not done.
- Every harness phase ends with a `qa` step (`docs/UI_QA.md`); `scripts/execute.py` enforces it.
- Do not claim tests pass unless you ran them in this session.
- Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).

## Commands
```
npm run dev       # dev server
npm run build     # production build
npm run lint      # ESLint
npm run test      # unit tests
python3 -m pytest -q scripts/   # harness and hook tests
python3 scripts/execute.py <phase>   # run a planned phase (see .claude/commands/harness.md)
```
