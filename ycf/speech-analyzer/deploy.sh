#!/usr/bin/env bash
set -euo pipefail

FUNCTION_NAME="${FUNCTION_NAME:-np-speech-agency-analyzer}"
RUNTIME="${RUNTIME:-nodejs22}"
ENTRYPOINT="${ENTRYPOINT:-index.handler}"
MEMORY="${MEMORY:-256m}"
TIMEOUT="${TIMEOUT:-15s}"
SERVICE_ACCOUNT_ID="${SERVICE_ACCOUNT_ID:-aje1ecompumksgp209p0}"
DOCAPI_ENDPOINT="${DOCAPI_ENDPOINT:-}"
DOCAPI_REGION="${DOCAPI_REGION:-ru-central1}"
DOCAPI_ACCESS_KEY_ID="${DOCAPI_ACCESS_KEY_ID:-}"
DOCAPI_SECRET_ACCESS_KEY="${DOCAPI_SECRET_ACCESS_KEY:-}"
YDB_TABLE="${YDB_TABLE:-speech_agency_logs}"
ZIP_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../speech-analyzer.zip"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
  echo "DEEPSEEK_API_KEY is required"
  exit 1
fi
if [[ -z "${DOCAPI_ENDPOINT:-}" || -z "${DOCAPI_ACCESS_KEY_ID:-}" || -z "${DOCAPI_SECRET_ACCESS_KEY:-}" ]]; then
  echo "DOCAPI_ENDPOINT, DOCAPI_ACCESS_KEY_ID and DOCAPI_SECRET_ACCESS_KEY are required"
  exit 1
fi

(
  cd "$SRC_DIR"
  npm ci --silent
  rm -f "$ZIP_PATH"
  zip -rq "$ZIP_PATH" index.js package.json package-lock.json node_modules
)

if ! yc serverless function get --name "$FUNCTION_NAME" >/dev/null 2>&1; then
  yc serverless function create --name "$FUNCTION_NAME" >/dev/null
fi

yc serverless function version create \
  --function-name "$FUNCTION_NAME" \
  --runtime "$RUNTIME" \
  --entrypoint "$ENTRYPOINT" \
  --memory "$MEMORY" \
  --execution-timeout "$TIMEOUT" \
  --service-account-id "$SERVICE_ACCOUNT_ID" \
  --source-path "$ZIP_PATH" \
  --environment "DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}" \
  --environment "DOCAPI_ENDPOINT=${DOCAPI_ENDPOINT}" \
  --environment "DOCAPI_REGION=${DOCAPI_REGION}" \
  --environment "DOCAPI_ACCESS_KEY_ID=${DOCAPI_ACCESS_KEY_ID}" \
  --environment "DOCAPI_SECRET_ACCESS_KEY=${DOCAPI_SECRET_ACCESS_KEY}" \
  --environment "YDB_TABLE=${YDB_TABLE}" \
  >/dev/null

yc serverless function allow-unauthenticated-invoke --name "$FUNCTION_NAME" >/dev/null

URL="$(yc serverless function get --name "$FUNCTION_NAME" --format json | jq -r '.http_invoke_url')"
echo "Deployed: $FUNCTION_NAME"
echo "URL: $URL"
