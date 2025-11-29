import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { PrefixConfig } from "@bucket-pulse/shared";
import { PrefixConfigRepository } from "./repositories";

interface DynamoPrefixConfigRepositoryProps {
  tableName: string;
  docClient: DynamoDBDocumentClient;
}

export class DynamoPrefixConfigRepository implements PrefixConfigRepository {
  private readonly tableName: string;
  private readonly docClient: DynamoDBDocumentClient;

  constructor(props: DynamoPrefixConfigRepositoryProps) {
    this.tableName = props.tableName;
    this.docClient = props.docClient;
  }

  private fromItem(item: Record<string, any>): PrefixConfig {
    return {
      bucketName: item.bucket_name,
      prefix: item.prefix,
      freshnessExpectedIntervalMinutes: item.freshness_expected_interval_minutes,
      freshnessWarningThresholdMinutes: item.freshness_warning_threshold_minutes,
      freshnessCriticalThresholdMinutes: item.freshness_critical_threshold_minutes,
      stalenessAgeDays: item.staleness_age_days,
      stalenessMaxPctOld: item.staleness_max_pct_old,
      partitionPattern: item.partition_pattern,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  }

  private toItem(config: PrefixConfig): Record<string, any> {
    return {
      bucket_name: config.bucketName,
      prefix: config.prefix,
      freshness_expected_interval_minutes: config.freshnessExpectedIntervalMinutes,
      freshness_warning_threshold_minutes: config.freshnessWarningThresholdMinutes,
      freshness_critical_threshold_minutes: config.freshnessCriticalThresholdMinutes,
      staleness_age_days: config.stalenessAgeDays,
      staleness_max_pct_old: config.stalenessMaxPctOld,
      partition_pattern: config.partitionPattern,
      created_at: config.createdAt,
      updated_at: config.updatedAt,
    };
  }

  async listByBucket(bucketName: string): Promise<PrefixConfig[]> {
    const resp = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "bucket_name = :b",
        ExpressionAttributeValues: { ":b": bucketName },
      }),
    );
    return (resp.Items ?? []).map((i) => this.fromItem(i));
  }

  async get(bucketName: string, prefix: string): Promise<PrefixConfig | null> {
    const resp = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { bucket_name: bucketName, prefix },
      }),
    );
    return resp.Item ? this.fromItem(resp.Item) : null;
  }

  async upsert(config: Omit<PrefixConfig, "createdAt" | "updatedAt">): Promise<PrefixConfig> {
    const existing = await this.get(config.bucketName, config.prefix);
    const now = new Date().toISOString();
    const full: PrefixConfig = {
      ...config,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: this.toItem(full),
      }),
    );
    return full;
  }

  async listAll(): Promise<PrefixConfig[]> {
    const results: PrefixConfig[] = [];
    let lastKey: Record<string, any> | undefined;
    do {
      const resp = await this.docClient.send(
        new ScanCommand({
          TableName: this.tableName,
          ExclusiveStartKey: lastKey,
        }),
      );
      (resp.Items ?? []).forEach((i) => results.push(this.fromItem(i)));
      lastKey = resp.LastEvaluatedKey;
    } while (lastKey);
    return results;
  }
}
