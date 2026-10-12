# Project: KIBO (Kiosk Intelligence Bridge & Operator)

Talk to your phone, and an existing self-order kiosk places the order. Built for the Google Cloud AI Builder Cup 2026 (submission 2026-10-17, public judging until 2026-11-06).

Read first: `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/ADR.md`, `docs/UI_GUIDE.md`. The prototype in `design/prototype/` shows the intended screens and flows.

## Stack
- Next.js (App Router), TypeScript strict, Tailwind CSS
- Cloud Run (`asia-northeast3`), Firestore, Secret Manager
- Gemini Live (voice, function calling) and Gemini Flash (text agent); Vertex AI for the offline learner
- Playwright (KIBO Learn), Vitest (unit), Playwright Test (E2E)

## Rules and the reasons behind them
- The product uses Gemini for all AI features. The hackathon requires Gemini/Google AI, and the judges score Google AI usage at 40%. OpenAI may only be used for offline learner experiments (`PROVIDER=openai`), never in `src/`.
- Every state change goes through `POST /api/command` with a `commandId`, an actor token and zod-validated arguments, applied in a Firestore transaction. Clients only read Firestore. Tool arguments come from the browser, so the server is the only place that can be trusted.
- The AI can open the confirm card but cannot complete a payment: `confirmCheckout` needs `confirming` state, a fresh user utterance and a matching `cartVersion`; `paid` needs the kiosk's card action. This is the product's main safety promise.
- Names, prices and options come only from menu data (`data/kiosks/*.json`, `skills/*.json`). Promotions, suggestions and AI replies must not mention items that are not in the data.
- No real brands, logos, menu photos or store screens. Third-party IP disqualifies the entry.
- Never print, log or commit secrets. Keys live in `.env` (git-ignored) or Secret Manager.
- Everything in the repo is in English (rules require it). Korean is allowed only as UI strings on the kiosk and in user-facing copy.
- Deploy with an explicit `--region asia-northeast3`; the local gcloud default points elsewhere.

## Scope
Do only what the current task or step asks. Do not add features, refactors or "improvements" beyond it, and do not add abstractions for a single use. If something looks wrong outside the task, mention it instead of changing it.

## Development process
- Logic (commands, state machine, validation, adapters, limits, learner): write the failing test first, then the code, then run the tests.
- UI tweaks, config and docs do not need test-first.
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
