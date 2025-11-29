import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { AthenaClient } from "@aws-sdk/client-athena";
import { SNSClient } from "@aws-sdk/client-sns";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { S3Client } from "@aws-sdk/client-s3";
import { GlueClient } from "@aws-sdk/client-glue";
import { DynamoBucketRepository } from "./dynamo-bucket-repository";
import { DynamoPrefixConfigRepository } from "./dynamo-prefix-config-repository";
import { DynamoPrefixStatusRepository } from "./dynamo-prefix-status-repository";
import { DynamoAlertRepository } from "./dynamo-alert-repository";
import { DynamoPrefixEvaluationRepository } from "./dynamo-prefix-evaluation-repository";
import { AthenaExplorerRepository } from "./athena-explorer-repository";
import { AthenaRunner } from "./athena-helpers";
import { SqlBuilderConfig } from "./sql-builder";
import { BucketSummary } from "@bucket-pulse/shared";

/**
 * Centralized clients so handlers can import a singleton rather than recreating per invocation.
 * These are intentionally thin; real repo/service wiring will replace the placeholder stubs.
 */
export const dynamoClient = new DynamoDBClient({});
export const dynamoDocClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

export const athenaClient = new AthenaClient({});
export const snsClient = new SNSClient({});
export const eventBridgeClient = new EventBridgeClient({});
export const s3Client = new S3Client({});
export const glueClient = new GlueClient({});

export const env = {
  bucketsTableName: process.env.BUCKETS_TABLE_NAME,
  prefixConfigTableName: process.env.PREFIX_CONFIG_TABLE_NAME,
  prefixStatusTableName: process.env.PREFIX_STATUS_TABLE_NAME,
  alertsTableName: process.env.ALERTS_TABLE_NAME,
  evaluationsTableName: process.env.PREFIX_EVALUATIONS_TABLE_NAME,
  alertsTopicArn: process.env.ALERTS_TOPIC_ARN,
  athenaWorkgroup: process.env.ATHENA_WORKGROUP,
  athenaResultLocation: process.env.ATHENA_RESULT_LOCATION,
};

export const bucketRepo = new DynamoBucketRepository({
  tableName: env.bucketsTableName ?? "bp_buckets",
  docClient: dynamoDocClient,
});

export const prefixConfigRepo = new DynamoPrefixConfigRepository({
  tableName: env.prefixConfigTableName ?? "bp_prefix_config",
  docClient: dynamoDocClient,
});

export const prefixStatusRepo = new DynamoPrefixStatusRepository({
  tableName: env.prefixStatusTableName ?? "bp_prefix_status",
  docClient: dynamoDocClient,
});

export const prefixEvalRepo = new DynamoPrefixEvaluationRepository({
  tableName: env.evaluationsTableName ?? "bp_prefix_evaluations",
  docClient: dynamoDocClient,
});

export const alertRepo = new DynamoAlertRepository({
  tableName: env.alertsTableName ?? "bp_alerts",
  byBucketIndexName: "byBucket",
  docClient: dynamoDocClient,
});

export const explorerRepo = new AthenaExplorerRepository({
  athenaClient,
  workGroup: env.athenaWorkgroup ?? "bucket_pulse",
  resultLocation: env.athenaResultLocation ?? "s3://replace-with-athena-results/",
  resolveInventoryTable: async (bucketName: string) => {
    const bucket = await bucketRepo.getBucket(bucketName);
    if (bucket?.inventoryTableName) {
      if (bucket.inventoryTableName.includes(".")) {
        const parts = bucket.inventoryTableName.split(".");
        const db = parts.slice(0, -1).join(".");
        const tbl = parts[parts.length - 1];
        return { database: db, table: tbl, fullyQualifiedName: `"${db}"."${tbl}"` };
      }
      return { database: "", table: bucket.inventoryTableName, fullyQualifiedName: `"${bucket.inventoryTableName}"` };
    }
    return {
      database: "",
      table: `inv_${bucketName.replace(/[-.]/g, "_")}`,
    };
  },
});

export const sqlBuilderConfig: SqlBuilderConfig = {
  resolveInventoryTable: (bucketName: string) => ({
    database: "",
    table: `inv_${bucketName.replace(/[-.]/g, "_")}`,
  }),
  resolveJournalTable: (bucketName: string) => ({
    database: "",
    table: `jn_${bucketName.replace(/[-.]/g, "_")}`,
  }),
};

export const athenaRunner = new AthenaRunner(athenaClient, {
  workGroup: env.athenaWorkgroup ?? "bucket_pulse",
  resultLocation: env.athenaResultLocation ?? "s3://replace-with-athena-results/",
});
