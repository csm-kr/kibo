# Step 0: deploy-ready

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: ADR-001, ADR-010, ADR-011; ARCHITECTURE "Deployment", "Region and secrets", "Environment variables", "Limits and cost"; SECURITY (all, especially "Secrets and repo hygiene" and "Reliability"); `docs/plan/OPERATIONS.md` (judging period).
- `Dockerfile`, `.dockerignore`, `.gcloudignore`, `next.config.ts`, `package.json`, `firestore.rules`, `src/app/api/health/route.ts`, `src/lib/store/index.ts`, `src/lib/limits/*`.
- Facts already set up on 10-12 (by the orchestrating session, not by you): Cloud Run service `kibo` in `asia-northeast3` (project `kibo-2026`); Firestore default database in `asia-northeast3` with TTL on `expiresAt` for `sessions` and `sessionSecrets`; deny-all rules from `firestore.rules` released; secret `gemini-api-key`; runtime service account `kibo-runtime@kibo-2026.iam.gserviceaccount.com` with `roles/datastore.user` and access to that secret.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`. You cannot run `gcloud` or `docker`; write the scripts, and the orchestrator runs them.

## Task
Make the app ready to deploy and to stay up for three weeks of judging.

### `scripts/deploy.sh`
A POSIX `sh` script (set -eu) that deploys from source with Cloud Build:
`gcloud run deploy kibo --source . --project kibo-2026 --region asia-northeast3 --service-account kibo-runtime@kibo-2026.iam.gserviceaccount.com --allow-unauthenticated --min-instances 1 --max-instances 3 --concurrency 80 --timeout 3600 --cpu 1 --memory 1Gi --set-secrets GEMINI_API_KEY=gemini-api-key:latest --set-env-vars STORE=firestore,GOOGLE_CLOUD_PROJECT=kibo-2026,GEMINI_TEXT_MODEL=gemini-3.8-flash,GEMINI_TEXT_THINKING=low,GEMINI_LIVE_MODEL=gemini-3.8-live`, then prints the service URL and curls `/api/health`. The region flag is mandatory (CLAUDE.md: the local gcloud default points elsewhere). `--timeout 3600` keeps SSE streams open up to an hour; `EventSource` reconnects after.
Note: this script is run by a person or the orchestrator, never by the app.

### Build context
- `.gcloudignore` and `.dockerignore`: make sure `data/`, `skills/` (later), `public/` and `src/` are included; `.env*`, `videos/`, `spikes/`, `design/`, `phases/`, `evals/`, `evidence/`, `e2e/`, `qa-output/`, `test-results/`, `playwright-report/` are excluded. The Docker build must not need dev-only files.
- `Dockerfile`: check the standalone output still includes `data/kiosks/*.json` (imported statically, so it is bundled) and `public/menu/*.jpg`; run `npm run build` locally and look at `.next/standalone` to confirm.

### Health
`GET /api/health` stays cheap (`{ ok, version, revision, store }`). Add `GET /api/health?deep=1`: also checks the store (`get` of a non-existent session id must return null without error) and Gemini model availability (`models.get` for the text and live model ids through `@google/genai`), cached for 60 s in memory, with a 5 s timeout each; returns `{ ok, checks: { store, textModel, liveModel } }` with 200 when all pass, 503 otherwise. No secrets in the response.

### Startup safety
- If `STORE=firestore` (production) and `GEMINI_API_KEY` is missing, routes that need Gemini return `UPSTREAM` with the plain message; the rest of the app still works (text menu, kiosk touch).
- `src/lib/store/index.ts`: in production, refuse `STORE=memory` unless `ALLOW_MEMORY_STORE=1` (the memory store breaks with more than one instance; ADR-010).

### Ops doc
Add a short "Deploy" section to `docs/plan/OPERATIONS.md`: the command, what each flag is for, how to roll back (`gcloud run services update-traffic kibo --to-revisions <rev>=100 --region asia-northeast3`), and the uptime check to create on `/api/health?deep=1`.

### Tests
- deep health with a fake store and fake model client: all ok → 200; model failure → 503; cached within 60 s;
- production + `STORE=memory` without the override throws at store creation.

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
```

## Verify
1. Run the AC commands; inspect `.next/standalone` for the menu JSON (bundled) and `public` handling per the Dockerfile.
2. Check: no secret values in any file; `--region asia-northeast3` in every gcloud command you wrote.
3. Update this step in `phases/5-ship/index.json` (completed + summary / error / blocked).

## Do not
- Do not put the API key or any secret value in files, flags or logs; it comes from Secret Manager.
- Do not remove the per-IP or daily limits to "make the demo smoother".
- Break existing tests.
