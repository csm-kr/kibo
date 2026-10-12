# Operations during judging and the finale

Not injected into harness steps (lives under `docs/plan/`).

## Deploy
Run `sh scripts/deploy.sh` (needs `gcloud` logged in to `kibo-2026`). It runs `gcloud run deploy kibo --source .` (Cloud Build builds the `Dockerfile`; `.gcloudignore` and `.dockerignore` keep `.env*`, docs, evidence, tests and videos out of the upload), prints the service URL and curls `/api/health`.

| Flag | Why |
|---|---|
| `--project kibo-2026 --region asia-northeast3` | Region is mandatory: the local gcloud default points elsewhere, and Firestore is in `asia-northeast3` |
| `--service-account kibo-runtime@…` | Runtime account with only `datastore.user`, access to `gemini-api-key` and `aiplatform.user` (the text agent's Vertex AI fallback) |
| `--allow-unauthenticated` | Judges and phones open the app without a Google login; the API's actor tokens and limits protect it |
| `--min-instances 1 --max-instances 3` | No cold start during judging; cost ceiling (the per-IP limit is per instance, so at most 3×) |
| `--concurrency 80` | Each open screen holds one SSE request (ADR-010) |
| `--timeout 3600` | SSE streams stay open up to an hour; `EventSource` reconnects after |
| `--cpu 1 --memory 1Gi` | Enough for the Next.js server and the Firestore listeners |
| `--set-secrets GEMINI_API_KEY=gemini-api-key:latest` | The key comes from Secret Manager, never from a file or flag value; voice and the text agent use it |
| `--set-env-vars STORE=firestore,…` | Firestore store (the app refuses `STORE=memory` in production unless `ALLOW_MEMORY_STORE=1`), project, text backend `auto` (the key first, Vertex AI on 402, 429 or 5xx/network errors; I-104, I-105), model ids (ADR-011), text thinking `low` |

**Which backend serves what:** voice always uses the Gemini API key (ephemeral tokens exist only there). The text agent uses the key while it works and falls back to Vertex AI, billed to the GCP account, per call; after 3 billing errors (402) within 5 minutes an instance skips the key for 10 minutes. Without `GEMINI_API_KEY`, or with its prepaid credits used up (HTTP 402, logged as `gemini billing error (402)` for voice and `gemini text fallback api->vertex (402)` for text), voice fails and the phone falls back to text; the text agent on Vertex AI and touch ordering still work. Top up the credits in AI Studio (a person's task). `GEMINI_TEXT_BACKEND=vertex` or `api` pins one backend.

**Roll back:** list revisions with `gcloud run revisions list --service kibo --region asia-northeast3`, then `gcloud run services update-traffic kibo --to-revisions <rev>=100 --region asia-northeast3`. A later deploy sends traffic to the new revision again.

**Uptime check:** in Cloud Monitoring, an HTTPS uptime check on `<service URL>/api/health?deep=1` every 5 min from at least 3 regions, alerting both team members by email. The deep check reads the store (a session id that never exists must come back empty), asks the Gemini API for the text and live model ids, makes one 1-output-token generation through the text backend (`textGenerate`, the key with the Vertex AI fallback) and one on the API key (`keyGenerate`, the key voice uses), and creates and discards a one-use ephemeral token (`liveToken`); 200 when all pass, 503 otherwise, body `{ ok, checks: { store, textModel, liveModel, textGenerate, keyGenerate, liveToken } }`. Only the two generations cost anything: two tiny requests per uptime check (every 5 min), negligible. Model lookups and token creation are free and kept passing on 10-13 while the key's credits were used up, which is why the generations were added (I-104). Results are cached for 60 s per instance, so the check makes at most six upstream calls a minute. Plain `/api/health` is the cheap liveness probe.

## Judging period (2026-10-19 to 11-06)
- Cloud Run `min-instances=1` (no cold start) and `max-instances=3` (cost ceiling).
- Gemini per-minute quota checked and capped. **Early finding:** generating six images in parallel hit HTTP 429 right away on our project, so check Live and Flash quotas and request increases if needed; the app turns 429 into "try again" plus text mode.
- Budget alerts notify only; they never stop spending. Automatic billing shutdown is not used because it would take the demo down.
- Model ids in environment variables; the replacement for any preview model is chosen in advance.
- `/api/health` + Cloud Monitoring uptime check; alerts to both team members; `/learned/*` included.
- Judges use `/demo` on one laptop; [Try again] resets the state. The README explains use in one minute.
- Freeze deploys to `main` during judging.
- Check the payment card's expiry and limit.

## Cost notes
- 10/1–10/11: about KRW 10k net on Gemini, almost all from KIBO Learn experiments that resent the whole conversation every turn.
- Fixes: memory tool, last 4 screens only, per-run token cap, finish gate. Experiments now run on OpenAI development credits; published numbers are re-measured with Gemini.

## Finale (top 50 announced 11/07; Singapore 12/04)
- Mentorship weeks (11/10–12/01): apply first-round feedback.
- Live demo: the touch vs voice comparison on stage, with an offline backup video and a hotspot; do not rely on venue Wi-Fi.
- Consider extending KIBO Learn to native kiosk apps via OS accessibility APIs.
- Check entry requirements for Singapore after the result.

## Gemini quotas (read 10-13 from the Service Usage API for project `kibo-2026`, "paid tier" buckets)
| Model | Requests | Input tokens |
|---|---|---|
| `gemini-3.8-flash` (text agent) | 1,000 per minute; 10,000 per day | 2,000,000 per minute |
| `gemini-3.8-live` (voice) | no per-minute request cap listed (-1) | 150,000 per minute |
One text order is about 2–3 `generateContent` rounds of about 9k input tokens each (manual check 10-13, no saved log), so the app's own caps (3,000 chat messages per day, 200 voice sessions per day) stay under these limits. Re-read the limits before judging starts; the higher tier buckets apply only if the project is upgraded.
