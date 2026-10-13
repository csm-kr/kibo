#!/bin/sh
# Deploys KIBO to Cloud Run from source (Cloud Build runs the Dockerfile). Run by a person, never by the app.
# The region is explicit: the local gcloud default points elsewhere. GEMINI_API_KEY comes from Secret Manager
# and serves voice (ephemeral tokens) and the text agent; with GEMINI_TEXT_BACKEND=auto the text agent falls back
# to Vertex AI (as the runtime service account) when the key fails on billing, quota or server errors.
# Flags are explained in docs/plan/OPERATIONS.md "Deploy".
# A failed Cloud Build leaves the old revision serving, so /api/health alone looks fine: the script succeeds only
# when /api/health reports a revision other than the one serving before. The last line is DEPLOYED or DEPLOY FAILED.
set -eu

PROJECT=kibo-2026
REGION=asia-northeast3
SERVICE=kibo

cd "$(dirname "$0")/.."

fail() {
  echo "DEPLOY FAILED: $1"
  exit 1
}

# Prints the revision /api/health reports at $1, or nothing.
health_revision() {
  curl -fsS --max-time 10 "$1/api/health" 2>/dev/null |
    node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{try{process.stdout.write(JSON.parse(s).revision??"")}catch{}})'
}

# The same build Cloud Build will run; a broken build stops here, before anything is uploaded.
npm run build || fail "local npm run build failed"

URL=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)' 2>/dev/null || true)
BEFORE=""
[ -n "$URL" ] && BEFORE=$(health_revision "$URL")
echo "Serving before: ${BEFORE:-none}"

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
  --set-env-vars STORE=firestore,GOOGLE_CLOUD_PROJECT=$PROJECT,GEMINI_TEXT_BACKEND=auto,GEMINI_TEXT_MODEL=gemini-3.8-flash,GEMINI_TEXT_THINKING=low,GEMINI_LIVE_MODEL=gemini-3.8-live ||
  fail "gcloud run deploy failed (the old revision ${BEFORE:-none} is still serving)"

URL=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)') ||
  fail "could not read the service URL"
echo "Service URL: $URL"

# Traffic moves when the deploy returns; allow a minute for the new revision to answer.
AFTER=""
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  AFTER=$(health_revision "$URL")
  [ -n "$AFTER" ] && [ "$AFTER" != "$BEFORE" ] && break
  sleep 5
done
[ -n "$AFTER" ] || fail "/api/health did not answer"
[ "$AFTER" != "$BEFORE" ] || fail "/api/health still reports the old revision $BEFORE"
echo "DEPLOYED $AFTER"
