#!/bin/sh
# One-time operations setup for kibo-2026, run by a person (docs/plan/OPERATIONS.md "Setup once"). Safe to run again:
# every resource is looked up before it is created. Default is a dry run that only prints the commands and calls
# nothing; `--apply` runs them. No secrets: alert e-mail addresses come from ALERT_EMAILS (comma-separated) in the
# shell, never from this file. Not yet run against Google Cloud (written in 15-judge-fixes:5).
#   1. Firestore TTL on expiresAt for sessions, sessionSecrets and pairCodes (deletes expired documents).
#   2. A Cloud Monitoring HTTPS uptime check on /api/health?deep=1 every 5 min from 3 regions.
#   3. An alert policy that e-mails when that check fails for 10 min.
set -eu

PROJECT=kibo-2026
REGION=asia-northeast3
SERVICE=kibo
CHECK=kibo-deep-health
POLICY="KIBO deep health failing"

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

# Dry run: print. Apply: print and run.
run() {
  echo "+ $*"
  [ "$APPLY" -eq 1 ] || return 0
  "$@"
}

[ "$APPLY" -eq 1 ] || echo "Dry run: nothing is called. Run with --apply to make the changes."

echo "== 1. Firestore TTL on expiresAt"
for GROUP in sessions sessionSecrets pairCodes; do
  # Enabling a TTL that is already on is a no-op.
  run gcloud firestore fields ttls update expiresAt --collection-group="$GROUP" --enable-ttl --async --project "$PROJECT"
done
run gcloud firestore fields ttls list --project "$PROJECT"

echo "== 2. Uptime check $CHECK"
HOST='<service host>'
if [ "$APPLY" -eq 1 ]; then
  URL=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')
  HOST=${URL#https://}
fi
EXISTING=""
[ "$APPLY" -eq 1 ] && EXISTING=$(gcloud monitoring uptime list-configs --project "$PROJECT" --filter "displayName=$CHECK" --format 'value(name)')
if [ -n "$EXISTING" ]; then
  echo "exists: $EXISTING"
else
  run gcloud monitoring uptime create "$CHECK" --project "$PROJECT" \
    --resource-type uptime-url --resource-labels "host=$HOST,project_id=$PROJECT" \
    --protocol https --path '/api/health?deep=1' --port 443 \
    --period 5 --timeout 30 --regions usa-iowa,europe,asia-pacific --status-codes 200
fi

echo "== 3. Alert policy \"$POLICY\""
CHANNELS=""
for EMAIL in $(echo "${ALERT_EMAILS:-}" | tr ',' ' '); do
  CHANNEL=""
  [ "$APPLY" -eq 1 ] && CHANNEL=$(gcloud beta monitoring channels list --project "$PROJECT" \
    --filter "type=\"email\" AND labels.email_address=\"$EMAIL\"" --format 'value(name)' | head -n 1)
  if [ -z "$CHANNEL" ]; then
    run gcloud beta monitoring channels create --project "$PROJECT" --type email \
      --display-name "KIBO alert $EMAIL" --channel-labels "email_address=$EMAIL"
    [ "$APPLY" -eq 1 ] && CHANNEL=$(gcloud beta monitoring channels list --project "$PROJECT" \
      --filter "type=\"email\" AND labels.email_address=\"$EMAIL\"" --format 'value(name)' | head -n 1)
  fi
  [ -n "$CHANNEL" ] && CHANNELS="$CHANNELS${CHANNELS:+,}\"$CHANNEL\""
done
[ -n "${ALERT_EMAILS:-}" ] || echo "ALERT_EMAILS is not set: the policy gets no e-mail channel (set it to both team members)."

CHECK_ID='<uptime check id>'
if [ "$APPLY" -eq 1 ]; then
  NAME=$(gcloud monitoring uptime list-configs --project "$PROJECT" --filter "displayName=$CHECK" --format 'value(name)')
  CHECK_ID=${NAME##*/}
fi
POLICY_EXISTS=""
[ "$APPLY" -eq 1 ] && POLICY_EXISTS=$(gcloud alpha monitoring policies list --project "$PROJECT" \
  --filter "displayName=\"$POLICY\"" --format 'value(name)')
if [ -n "$POLICY_EXISTS" ]; then
  echo "exists: $POLICY_EXISTS"
else
  # Fails when the check reports false from any region for 10 min: the console's own uptime alert shape.
  FILE=$(mktemp)
  cat > "$FILE" <<EOF
{
  "displayName": "$POLICY",
  "combiner": "OR",
  "conditions": [{
    "displayName": "Uptime check $CHECK failing",
    "conditionThreshold": {
      "filter": "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"$CHECK_ID\"",
      "aggregations": [{ "alignmentPeriod": "1200s", "perSeriesAligner": "ALIGN_NEXT_OLDER", "crossSeriesReducer": "REDUCE_COUNT_FALSE", "groupByFields": ["resource.label.*"] }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": 1,
      "duration": "600s",
      "trigger": { "count": 1 }
    }
  }],
  "notificationChannels": [$CHANNELS]
}
EOF
  cat "$FILE"
  run gcloud alpha monitoring policies create --project "$PROJECT" --policy-from-file "$FILE"
  rm -f "$FILE"
fi
echo "OPS SETUP $([ "$APPLY" -eq 1 ] && echo APPLIED || echo PRINTED)"
