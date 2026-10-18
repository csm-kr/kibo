#!/bin/sh
# Deploys kibo-voice, the voice relay (voice-relay/, Dockerfile.voice), to Cloud Run. Run by a person, never by the app.
# The browser's voice goes through this relay to Vertex AI Live (us-central1), billed post-paid to the project, so voice
# no longer depends on the Gemini API key's prepaid credits (I-104). The Next.js service (scripts/deploy.sh) is separate.
# `gcloud run deploy --source` only reads ./Dockerfile, so Cloud Build builds Dockerfile.voice into an image first.
# The region is explicit: the local gcloud default points elsewhere. The last line is DEPLOYED or DEPLOY FAILED.
set -eu

PROJECT=kibo-2026
REGION=asia-northeast3
SERVICE=kibo-voice
# The Artifact Registry repository that source deploys of the kibo service use.
IMAGE="$REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/$SERVICE:$(date +%Y%m%d-%H%M%S)"

cd "$(dirname "$0")/.."

fail() {
  echo "DEPLOY FAILED: $1"
  exit 1
}

# Prints the revision /health reports at $1, or nothing.
health_revision() {
  curl -fsS --max-time 10 "$1/health" 2>/dev/null |
    node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{try{process.stdout.write(JSON.parse(s).revision??"")}catch{}})'
}

# The same bundle Cloud Build will make; a broken bundle stops here, before anything is uploaded.
npm run voice:build || fail "local npm run voice:build failed"

URL=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)' 2>/dev/null || true)
BEFORE=""
[ -n "$URL" ] && BEFORE=$(health_revision "$URL")
echo "Serving before: ${BEFORE:-none}"

gcloud builds submit . \
  --project "$PROJECT" \
  --config voice-relay/cloudbuild.yaml \
  --substitutions "_IMAGE=$IMAGE" ||
  fail "Cloud Build failed (the old revision ${BEFORE:-none} is still serving)"

# One WebSocket holds one request for the whole voice session (at most 10 min, below the 900 s timeout).
# Session affinity keeps a reconnecting browser on the same instance when the browser keeps Cloud Run's cookie.
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --service-account "kibo-runtime@$PROJECT.iam.gserviceaccount.com" \
  --allow-unauthenticated \
  --min-instances 1 \
  --max-instances 2 \
  --concurrency 80 \
  --timeout 900 \
  --session-affinity \
  --cpu 1 \
  --memory 512Mi \
  --set-env-vars STORE=firestore,GOOGLE_CLOUD_PROJECT=$PROJECT,GEMINI_LIVE_MODEL=gemini-3.8-live,VOICE_VERTEX_LOCATION=us-central1 ||
  fail "gcloud run deploy failed (the old revision ${BEFORE:-none} is still serving)"

URL=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)') ||
  fail "could not read the service URL"
echo "Service URL: $URL"

# Traffic moves when the deploy returns; allow a minute for the new revision to answer (a cold start with min 0).
AFTER=""
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  AFTER=$(health_revision "$URL")
  [ -n "$AFTER" ] && [ "$AFTER" != "$BEFORE" ] && break
  sleep 5
done
[ -n "$AFTER" ] || fail "/health did not answer"
[ "$AFTER" != "$BEFORE" ] || fail "/health still reports the old revision $BEFORE"
echo "DEPLOYED $AFTER"
