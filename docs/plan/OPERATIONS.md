# Operations during judging and the finale

Not injected into harness steps (lives under `docs/plan/`).

## Deploy
Run `sh scripts/deploy.sh` (needs `gcloud` logged in to `kibo-2026`). It runs `npm run build` locally first and stops if it fails, notes the revision `/api/health` reports, runs `gcloud run deploy kibo --source .` (Cloud Build builds the `Dockerfile`; `.gcloudignore` and `.dockerignore` keep `.env*`, docs, tests and videos out of the upload but keep `evidence/`, `data/`, `skills/` and `package.json`, which `src/` imports; `scripts/build-context.test.ts` checks this), then waits up to a minute for `/api/health` to report a **new** revision. Its last line is `DEPLOYED <revision>` or `DEPLOY FAILED: <reason>`. A failed Cloud Build leaves the old revision serving, so `/api/health` alone answering is not proof of a deploy (10-13); read the last line. `scripts/deploy.test.ts` runs the script with fake `gcloud`, `curl` and `npm`.

| Flag | Why |
|---|---|
| `--project kibo-2026 --region asia-northeast3` | Region is mandatory: the local gcloud default points elsewhere, and Firestore is in `asia-northeast3` |
| `--service-account kibo-runtime@…` | Runtime account with only `datastore.user`, access to `gemini-api-key` and `aiplatform.user` (the text agent's Vertex AI fallback) |
| `--allow-unauthenticated` | Judges and phones open the app without a Google login; the API's actor tokens and limits protect it |
| `--min-instances 1 --max-instances 3` | No cold start during judging; cost ceiling (the per-IP limit is per instance, so at most 3×) |
| `--concurrency 80` | Each open screen holds one SSE request (ADR-010) |
| `--timeout 900` | Above the events route's own 15 min cap, so the server, not Cloud Run, ends each SSE stream cleanly; `EventSource` reconnects on screens in use. Was 3600 until 12-phone-app:7 (see "Open streams and cost") |
| `--cpu 1 --memory 1Gi` | Enough for the Next.js server and the Firestore listeners |
| `--set-secrets GEMINI_API_KEY=gemini-api-key:latest` | The key comes from Secret Manager, never from a file or flag value; voice and the text agent use it |
| `--set-env-vars STORE=firestore,…` | Firestore store (the app refuses `STORE=memory` in production unless `ALLOW_MEMORY_STORE=1`), project, text backend `auto` (the key first, Vertex AI on 402, 429 or 5xx/network errors; I-104, I-105), model ids (ADR-011), text thinking `low`, and `PUBLIC_ORIGIN` = `https://kibo-<project number>.asia-northeast3.run.app` (the script reads the number with `gcloud projects describe`), so every QR link and the kiosk's "<host>/app" line use the deterministic service URL. With `SHORT_APP_URL` set in the deploying shell (e.g. `SHORT_APP_URL=kibo-2026.web.app sh scripts/deploy.sh`), it is added too, and the kiosk shows that host instead of "<host>/app"; QR links do not change. `--set-env-vars` replaces every variable, so a deploy without it removes it from the service |

**Short address (`kibo-2026.web.app`, 12-phone-app:6):** the kiosk's pairing line is a host people type on a phone, and the Cloud Run host is 45 characters (I-167). Firebase Hosting on `kibo-2026` serves only redirects, no files and no Firebase SDK in the app: `firebase.json` (public folder `hosting-public/`, empty) sends `/` to `<Cloud Run>/app` and every other path to the same path on Cloud Run (302; the first match wins; a `/:path**` glob did not match paths like `/app/scan`, so the second rule is a named-group regex). Live since 10-13 about 16:50 KST, deployed by the orchestrating session through the Hosting REST API; redeploy from `firebase.json` after a change (a person or the orchestrator, never a harness step). Then deploy the app with `SHORT_APP_URL=kibo-2026.web.app`; the app ignores a value that is not a bare lowercase host (one log line), and `scripts/deploy.sh` refuses one with characters other than `a-z0-9.-`. Check: K1 and the landscape pairing panel show `kibo-2026.web.app` on one line, and `https://kibo-2026.web.app` opens `/app`.

**Open streams and cost (12-phone-app:7):** a cost check of the GCP project on 10-13 (orchestrating session, billing console, no saved file) found Cloud Run billed as "active" almost all the time: each SSE stream stayed open up to the 3,600 s request timeout and `EventSource` reconnected at once, so one forgotten `/kiosk` or `/demo` tab kept an instance busy. Active time cost about KRW 4,350 per instance per day against about KRW 820 for an idle minimum instance, about KRW 110,000 until judging ends on 11-06 if nothing changed (own estimate from those rates). Now: (1) a hidden tab closes its stream after 60 s and reopens it when visible; (2) a screen with no session change and no pointer or key input for 20 min closes its stream and shows "Paused · Tap to continue" (kiosk: Korean first, English below) until tapped; (3) the events route ends every stream after 15 min with a final comment, and `EventSource` reconnects on screens still in use; (4) `--timeout 900`, above that cap. Pings (one short request every 30 s per screen) are unchanged. After the next deploy, check in the Cloud Run metrics that billable instance time falls to the minimum instance when no one has a screen open (unverified until then).

**Firestore TTL (once, by a person):** TTL policies delete expired documents on `expiresAt`: `sessions`, `sessionSecrets` and, since 12-phone-app:3, `pairCodes` (the kiosk's 6-digit pairing codes). Enable the new one with `gcloud firestore fields ttls update expiresAt --collection-group=pairCodes --enable-ttl --project kibo-2026` and check it with `gcloud firestore fields ttls list --project kibo-2026`. Without it, used-up codes stay in the collection (they no longer work, because a code must also be the session's current `sessionSecrets.pairCode`), and the 1,000,000 codes slowly fill up. TTL deletes up to about a day late, which the code reservation allows for.

**Which backend serves what:** voice always uses the Gemini API key (ephemeral tokens exist only there). The text agent uses the key while it works and falls back to Vertex AI, billed to the GCP account, per call; after 3 billing errors (402) within 5 minutes an instance skips the key for 10 minutes. Without `GEMINI_API_KEY`, or with its prepaid credits used up (HTTP 402, logged as `gemini billing error (402)` for voice and `gemini text fallback api->vertex (402)` for text), voice fails and the phone falls back to text; the text agent on Vertex AI and touch ordering still work. Top up the credits in AI Studio (a person's task). `GEMINI_TEXT_BACKEND=vertex` or `api` pins one backend.

**Voice relay `kibo-voice` (12-phone-app:8, not deployed yet):** a second Cloud Run service from this repo (`voice-relay/`, `Dockerfile.voice`), so voice can run on Vertex AI Live (post-paid, `us-central1`, the only region that served `gemini-3.8-live` on 10-13) instead of the key's prepaid credits; the phone does not use it until 12-phone-app:9. Deploy with `sh scripts/deploy-voice.sh` (a person or the orchestrator): it bundles locally (`npm run voice:build`), builds `Dockerfile.voice` with Cloud Build (`voice-relay/cloudbuild.yaml`, image in the `cloud-run-source-deploy` repository of `asia-northeast3`, assumed to exist from the kibo source deploys, unverified), deploys `kibo-voice` in `asia-northeast3` with the same runtime service account (its `aiplatform.user` covers Vertex Live), `--min-instances 0 --max-instances 2 --timeout 900 --session-affinity`, no secret, and ends with `DEPLOYED <revision>` / `DEPLOY FAILED: <reason>` after `/healthz` reports a new revision (`scripts/deploy-voice.test.ts`). The browser's first WebSocket message carries the device token; the relay runs the token route's checks and budgets. `npm run voice:relay-check` drives one real text turn through a local relay.

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

## Two-device demo
A laptop stands in for the kiosk and a real phone orders (USER_JOURNEY J1, J2). Checked end to end by `e2e/two-device.spec.ts` (two browsers through the real API; the `@live` test speaks `hero-ko.wav` to Gemini Live).
1. **Laptop:** open `<service URL>/kiosk?k=malo` in Chrome, full screen (F11 or ⌃⌘F), landscape. KIBO's pairing panel beside the kiosk shows a large QR, `<host>/app` and a 6-digit code, and "Waiting for a phone".
2. **Phone:** scan the QR with the camera app and tap the link; or open `<host>/app` (installable from the browser menu) and tap [Scan a kiosk], or type the 6-digit code and tap [Connect].
3. **Allow** the camera (only for [Scan a kiosk]) and the microphone when the phone asks. The panel now says "Phone connected at <time>".
4. **Talk:** [Start], [Turn on the microphone], [Eat here], then say the order. The kiosk lights up the lines; say "I'll pay", tap [Yes, pay now] on the phone, then on the laptop tap 카드 and 카드 넣기. The order number shows on both.
5. **KakaoTalk, NAVER and other in-app browsers** often block the microphone and camera. The phone shows a note: open the link in Safari or Chrome (the in-app menu's "open in browser"), or copy it on the microphone screen before connecting. [Order here by typing] still works in the app.
6. **Stuck or a lost phone:** [다른 휴대폰 연결] on the kiosk issues a new QR and code and releases the old phone. Voice needs the Gemini API key's credits (`keyGenerate` ok in `/api/health?deep=1`); without them the phone falls back to typing.

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
