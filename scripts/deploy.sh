#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUTS_FILE="$ROOT_DIR/cdk-outputs.json"
UI_DIST="$ROOT_DIR/packages/ui/dist/ui/browser"
UI_ENV_JSON="$ROOT_DIR/packages/ui/dist/ui/browser/env.json"

command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }
command -v aws >/dev/null 2>&1 || { echo "aws CLI is required" >&2; exit 1; }

pushd "$ROOT_DIR" >/dev/null

echo "==> Installing dependencies"
npm install

echo "==> Building shared/backend/infra workspaces"
npm run build --workspaces

echo "==> Deploying CDK stack"
(cd packages/infra && npm run cdk:deploy -- --require-approval never --outputs-file "$OUTPUTS_FILE")

echo "==> Parsing outputs"
API_BASE_URL=$(jq -r '.BucketPulseStack.ApiBaseUrl' "$OUTPUTS_FILE")
UI_BUCKET=$(jq -r '.BucketPulseStack.UiBucketName' "$OUTPUTS_FILE")
CF_DOMAIN=$(jq -r '.BucketPulseStack.CloudFrontDomainName' "$OUTPUTS_FILE")
USER_POOL_ID=$(jq -r '.BucketPulseStack.UserPoolId // empty' "$OUTPUTS_FILE")
USER_POOL_CLIENT_ID=$(jq -r '.BucketPulseStack.UserPoolClientId // empty' "$OUTPUTS_FILE")
USER_POOL_DOMAIN=$(jq -r '.BucketPulseStack.UserPoolDomain // empty' "$OUTPUTS_FILE")
REGION="${AWS_REGION:-$(aws configure get region 2>/dev/null || echo '')}"
if [[ -z "$REGION" ]]; then
  REGION="us-east-1"
fi

if [[ -z "$API_BASE_URL" || -z "$UI_BUCKET" || -z "$CF_DOMAIN" ]]; then
  echo "Missing required outputs (ApiBaseUrl, UiBucketName, CloudFrontDomainName)" >&2
  exit 1
fi

echo "==> Building UI"
npm run build --workspace packages/ui

if [[ ! -d "$UI_DIST" ]]; then
  echo "UI dist not found at $UI_DIST" >&2
  exit 1
fi

# Generate env.json for the UI build
REDIRECT_URI="https://$CF_DOMAIN"
USER_POOL_DOMAIN_FULL="$USER_POOL_DOMAIN"
if [[ -n "$USER_POOL_DOMAIN" && "$USER_POOL_DOMAIN" != *"amazoncognito.com"* ]]; then
  USER_POOL_DOMAIN_FULL="${USER_POOL_DOMAIN}.auth.${REGION}.amazoncognito.com"
fi
cat > "$UI_ENV_JSON" <<EOF2
{
  "baseApiUrl": "$API_BASE_URL",
  "userPoolId": "$USER_POOL_ID",
  "userPoolClientId": "$USER_POOL_CLIENT_ID",
  "userPoolDomain": "$USER_POOL_DOMAIN_FULL",
  "redirectUri": "$REDIRECT_URI"
}
EOF2

echo "==> Syncing UI to S3 bucket $UI_BUCKET"
aws s3 sync "$UI_DIST" "s3://$UI_BUCKET/" --delete

echo "Deployment complete. UI at https://$CF_DOMAIN"

popd >/dev/null
