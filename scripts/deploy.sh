#!/bin/sh
# Deploys KIBO to Cloud Run from source (Cloud Build runs the Dockerfile). Run by a person, never by the app.
# The region is explicit: the local gcloud default points elsewhere. GEMINI_API_KEY comes from Secret Manager
# and serves voice (ephemeral tokens) and the text agent; with GEMINI_TEXT_BACKEND=auto the text agent falls back
# to Vertex AI (as the runtime service account) when the key fails on billing, quota or server errors.
# Flags are explained in docs/plan/OPERATIONS.md "Deploy".
set -eu

PROJECT=kibo-2026
REGION=asia-northeast3
SERVICE=kibo

cd "$(dirname "$0")/.."

gcloud run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT" \
  --region "$REGION" \
  --service-account "kibo-runtime@$PROJECT.iam.gserviceaccount.com" \
  --allow-unauthenticated \
  --min-instances 1 \
  --max-instances 3 \
  --concurrency 80 \
  --timeout 3600 \
  --cpu 1 \
  --memory 1Gi \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
  --set-env-vars STORE=firestore,GOOGLE_CLOUD_PROJECT=$PROJECT,GEMINI_TEXT_BACKEND=auto,GEMINI_TEXT_MODEL=gemini-3.8-flash,GEMINI_TEXT_THINKING=low,GEMINI_LIVE_MODEL=gemini-3.8-live

URL=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')
echo "Service URL: $URL"
curl -fsS "$URL/api/health"
echo
