# BucketPulse

BucketPulse is a serverless reference app that gives near–real-time visibility into S3 bucket health (freshness/staleness), built on S3 Inventory/Journal tables. It ships with:

- Frontend: Angular SPA hosted in S3 + CloudFront.
- Backend: API Gateway (HTTP API) + Lambda + DynamoDB + EventBridge.
- Auth: Cognito User Pool by default (pluggable to external IdP).
- Deployment: One-command script that deploys infra, builds UI, and uploads it.

## What you get (MVP screens)

- Buckets List: register buckets, see KPIs (counts, prefixes), search/filter by status, click through to details.
- Bucket Detail: bucket-level KPIs, recent alerts, tracked prefixes table, add prefix via modal with validation.
- Prefix Health: status pill/reason, freshness/staleness thresholds, recent alerts, evaluation history timeline with pagination, edit prefix thresholds.
- Alerts: filter by severity/type/bucket/prefix/date, table with severity/type/message/resolved, pagination, links to prefix health.
- Explorer: filter inventory by bucket/prefix/size/age/storage class/tags, summaries for objects/bytes, table of objects, per-row details modal (metadata, tags, copy S3 URI/key/etag, freshness context when prefix is set).

## Prerequisites

- Node.js >= 20
- AWS CLI configured with deploy permissions
- `jq` installed (for parsing CDK outputs)
- CDK bootstrap done in the target account/region (`cdk bootstrap`).

## Quick deploy (one command)

```bash
./scripts/deploy.sh
```

The script will:
1) Install dependencies and build workspaces.
2) `cdk deploy` the stack (outputs to `cdk-outputs.json`).
3) Generate `packages/ui/src/assets/env.json` from CDK outputs (API URL, Cognito config, redirect URI).
4) Build the Angular UI.
5) Sync the UI build to the provisioned S3 bucket.

After deploy, the UI is available at the CloudFront domain output by CDK.

## Development

- Backend/Infra build: `npm run build --workspaces`
- UI dev server: `cd packages/ui && npm start` (ensure `src/env.json` or `src/assets/env.json` points to your API/Cognito).

## Auth

- Default: Cognito User Pool + Hosted UI (Authorization Code + PKCE). CDK outputs include UserPoolId, ClientId, Domain.
- External IdP: pass `authIssuer`/`authAudience` to the stack to use an external JWT issuer; API Gateway uses a JWT authorizer.

## Project structure

- `packages/shared` – shared DTOs/types.
- `packages/backend` – Lambda handlers, core services.
- `packages/infra` – CDK stack (infra, auth, API, tables, UI hosting).
- `packages/ui` – Angular SPA.
- `scripts/deploy.sh` – end-to-end deploy script.

## Status

- Infra, auth, and core API scaffolding are in place.
- UI has placeholders for Buckets, Prefix Health, Alerts, Explorer, with auth wiring and runtime config via `env.json`.
- Aggregation logic computes freshness/staleness/anomaly statuses and writes alerts.

Next iterations will flesh out UI screens and tighten auth/roles as needed.
