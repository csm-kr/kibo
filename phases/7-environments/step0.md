# Step 0: gemini-backend

## Read first
- `CLAUDE.md` and `docs/*.md` are in your prompt. Sections: ADR-003, ADR-008, ADR-011; ARCHITECTURE "Voice", "Region and secrets", "Environment variables"; SECURITY "Gemini Live tokens"; `docs/plan/OPERATIONS.md` (read it: deploy, uptime check, quotas).
- Code: `src/lib/agent/{model,live,chat}.ts`, `src/lib/health.ts`, `src/app/api/health/route.ts`, `scripts/eval-agent.ts`, `scripts/deploy.sh`, and their tests.

Shell: only `npm`, `npx`, `node`, `python3`, `ls`, `mkdir`, `git status|diff|add|commit|log`.

## Why (found 10-13 by the orchestrating session)
The Gemini Developer API key for project `kibo-2026` now answers every `generateContent` with **HTTP 402 "Your prepayment credits are depleted"** (AI Studio prepaid billing). The deployed `/demo` text and voice orders fail, and `/api/health?deep=1` still says ok because `models.get` does not spend credits. Gemini on **Vertex AI** in the same project works (bills the GCP billing account; checked with `aiplatform.googleapis.com/v1/projects/kibo-2026/locations/global/publishers/google/models/gemini-3.8-flash:generateContent`), and the Cloud Run runtime service account `kibo-runtime@kibo-2026.iam.gserviceaccount.com` now has `roles/aiplatform.user`. Topping up AI Studio credits is a person's task (the user was notified). Live ephemeral tokens exist only on the Developer API, so voice still needs the key and its credits.

## Task (tests first; no network in unit tests)
1. **Text agent backend switch.** `geminiClient()` reads `GEMINI_TEXT_BACKEND` = `vertex` | `api` (default **`vertex`**). `vertex`: `new GoogleGenAI({ vertexai: true, project: GOOGLE_CLOUD_PROJECT ?? "kibo-2026", location: GEMINI_VERTEX_LOCATION ?? "global" })` (application default credentials: the runtime service account on Cloud Run, gcloud ADC locally); `api`: the current API-key client. Same model id, thinking level and request shape; check the installed SDK's README for the Vertex options. Map Vertex errors like the API's: 429 → `RATE_LIMITED`, others → `UPSTREAM`; a 402/billing error → `UPSTREAM` with a log line `gemini billing error (402)` (no body).
2. **Voice stays on the Developer API** (ephemeral tokens). When `issueLiveToken` or the browser connect fails, the phone already falls back to text; make sure a 402 from `authTokens.create` maps to `UPSTREAM` with the plain message "Voice is not available right now. Please type." and is logged as a billing error.
3. **Deep health that sees billing.** `GET /api/health?deep=1` adds `textGenerate` (a 1-output-token `generateContent` through the configured text backend, "Reply with OK") and `liveToken` (create and discard an ephemeral token with `uses: 1` and a 60 s expiry; it is free and fails when the key is unusable). Keep the 60 s cache and 5 s timeouts; return 503 when any check fails, with each check's `ok|fail`. Note the cost in OPERATIONS: one tiny generation per uptime check (every 5 min) is negligible.
4. **Eval and scripts** use the same `geminiClient()`, so local runs use Vertex through gcloud ADC by default; document `GEMINI_TEXT_BACKEND=api` for comparison.
5. **Deploy script:** add `GEMINI_TEXT_BACKEND=vertex` to `--set-env-vars` in `scripts/deploy.sh`; ARCHITECTURE "Environment variables" and "Region and secrets" (R-002), ADR-011 one line ("text agent on Vertex AI since 10-13; voice on the Gemini API for ephemeral tokens"), SECURITY (runtime SA roles now include `aiplatform.user`).
6. Log the incident in `docs/ISSUE.md` (P0, area `agent`, class `upstream-billing`, how it was found, the fix, and that voice needs the credits topped up by a person); mark it `open` until voice works again, with the text path fixed.
7. Run `npm run eval:agent` once (it now goes through Vertex) and report the pass rate; it must be ≥ the last result (28/28 + grounded-reply cases).

## Acceptance criteria
```bash
npm run lint
npm run build
npm run test
npm run eval:agent
```

## Verify
1. Run the AC commands.
2. Check: no API key or ADC token in logs or files; the Vertex path needs no key.
3. Update this step in `phases/7-environments/index.json` (completed + summary / error / blocked; if Vertex calls fail from this shell for credentials, set blocked with the exact error code, not the body).

## Do not
- Do not move voice off ephemeral tokens or relay audio through the server in this step (ADR-003); that would be a separate decision.
- Do not use any non-Gemini model.
- Break existing tests.
