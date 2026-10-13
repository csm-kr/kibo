# Orchestrator handoff (updated 10-13 ~20:10 KST)

The orchestrating session ran `/harness` from 10-12 22:30. The user delegated all decisions ("don't ask, decide") except things only a person can do (payments, logins). Read this, then `phases/index.json`, then the latest `phases/<phase>/index.json` summaries.

## State
| Phase | Status | Notes |
|---|---|---|
| 1-core … 11-hardening | completed | `main` = 11-hardening (`cf25e9d`); production `kibo-00011-dgq` |
| 12-phone-app | running (chain4), qa step last | phone redesign, PWA `/app`, 6-digit pairing code + in-app QR scanner, laptop kiosk pairing panel, `/demo` "use my phone", short address, stream idle (cost), **voice relay `kibo-voice` to Vertex AI Live (ADR-012)** |
| 13-blind-kiosks | queued (chain5 waiter, HARNESS_TIMEOUT=3600) | learner dev runs use `PROVIDER=openai` (user decision 10-13); blind baselines/finals stay on Gemini (published numbers) |
| 14-final | drafted, not in `phases/` yet | drafts in the orchestrator scratchpad `phase14-draft/`: judge-review, judge-fixes, numbers-final, shots-final, repo-ready, qa |

Runner: `.harness-logs/chain.sh <phase…>` (retries a phase up to 3× after a network/DNS outage via `.harness-logs/reset_network_failure.py`). The chain and the two waiters are background tasks of the old session; **if they are gone, resume with**:
```
HARNESS_TIMEOUT=2700 HARNESS_MAX_TURNS=300 sh .harness-logs/chain.sh 11-hardening 12-phone-app > .harness-logs/chainX.log 2>&1
HARNESS_TIMEOUT=3600 HARNESS_MAX_TURNS=300 sh .harness-logs/chain.sh 13-blind-kiosks > .harness-logs/chainY.log 2>&1
```
`execute.py` resumes at the first pending step; a step in `error` needs `status: pending` and its `error_message` removed first.

## Production
- URL: https://kibo-407514467119.asia-northeast3.run.app (`/`, `/demo`, `/kiosk`, `/assistant`, `/learned/doughhouse`, `/mic-test`). Serving `kibo-00010-zpv` = phase 11 step 1 (security fixes). Deep health `/api/health?deep=1` all ok.
- Deploy only from a clean worktree, never from the live harness tree: `/private/tmp/claude-501/-Users-sungmincho-mac-Desktop-sm-apps-kibo/<session>/scratchpad/deploy` (`git checkout -q -- . && git checkout -q --detach <commit>`, real `node_modules` via `npm ci`, **not a symlink**: Turbopack refuses it), then `sh scripts/deploy.sh`; trust only its last line `DEPLOYED <rev>` / `DEPLOY FAILED`.
- GCP set up by the orchestrator: Firestore (asia-northeast3, TTL on `sessions`, `sessionSecrets`, `pairCodes` `expiresAt`), deny-all rules, Secret Manager `gemini-api-key`, runtime SA `kibo-runtime` (datastore.user, secret accessor, aiplatform.user), uptime check `kibo-deep-health` + email alert, Speech API enabled.
- Text agent `GEMINI_TEXT_BACKEND=auto` (API key first, Vertex fallback); voice `gemini-3.8-live` needs the AI Studio prepaid credits (ran out once on 10-13, I-104; the user topped up).
- `.env` (never print): GEMINI_API_KEY, OPENAI_API_KEY (offline only), MS_SPEECH_KEY/ENDPOINT (offline comparison only), GEMINI_TEXT_BACKEND=api (local).

## Decisions made by the orchestrator (all logged in docs)
SSE instead of the Firebase client SDK (ADR-010); model ids (ADR-011); Playwright for automated UI QA; I-029 option A (AI confirm only after a phone-opened review); error copy localized on screens; airport fares changed away from real-operator numbers (I-122); fair touch measurement 24 taps (efficient path), 41-tap edit path as footnote; no option editing on kiosk lines (I-039); `[처음으로]` on standalone kiosk; text backend auto fallback.

## Changes on 10-13 afternoon (orchestrator)
- AI Studio prepaid credits are empty (HTTP 402, I-104); the user chose **not** to depend on them: voice falls back to the `kibo-voice` relay (Vertex AI Live `gemini-3.8-live`, us-central1 only, post-paid). Local `.env` has `GEMINI_TEXT_BACKEND=vertex` so harness runs never spend the key. Vertex text is slow under parallel load (I-157: up to 70 s per call with 5 parallel requests).
- `kibo-voice` deployed once (`kibo-voice-00001-6kz`, `wss://kibo-voice-407514467119.asia-northeast3.run.app/ws`); `/healthz` is swallowed by Cloud Run (paths ending in `z` are reserved) and phase 12 qa renames it to `/health`.
- Short address: Firebase added to `kibo-2026` (terms accepted by the user's request), Hosting site `kibo-2026.web.app` deployed through the Hosting REST API as redirects only (`/` → `<run.app>/app`, `^/(?P<path>.+)$` → same path). Re-deploy with the orchestrator's `hosting-redirect.sh` pattern or `firebase.json`.
- Deploy after phase 12, in this order: `sh scripts/deploy-voice.sh`, then `SHORT_APP_URL=kibo-2026.web.app VOICE_RELAY_URL=wss://kibo-voice-407514467119.asia-northeast3.run.app/ws sh scripts/deploy.sh` (both from the clean worktree). Then check `/api/health?deep=1` (`liveRelay` ok) and `git branch -f main feat-12-phone-app`.
- Cost (agent report 10-13): month to 10-12 net KRW 32,741 (gross 51,263); Cloud Run active time from open SSE streams was the growing cost (fixed by phase 12 stream-idle, timeout 900). A KRW 100,000 alert-only budget was added. Billing card: the backup Mastercard is fine (user).
- The user wants GPT/Azure only for development; the product stays Gemini (hackathon rules).

## Open items for the next orchestrator
- Watch phases 11–13; look at screenshots after every UI step; deploy after each phase (phase 12 especially: phone redesign).
- Cost: a background agent was checking GCP spend (the user saw > KRW 50,000); see its report or redo: budget alert, Artifact Registry cleanup, min-instance/CPU settings, deep-health generation frequency.
- Azure: Developer support plan already cancelled (expires 11-11); refund ticket 2610120060001183 open. Azure resource `kibo-voice-compare` (East US) exists only for the offline voice comparison; delete it when no longer needed (ask the user).
- Real-phone checks (iOS Safari, KakaoTalk/NAVER in-app) are still undone: `/mic-test` exists for the teammate.
- Video: footage in `videos/footage/2026-10-13/` (real screens); real-phone voice footage needs a person.
