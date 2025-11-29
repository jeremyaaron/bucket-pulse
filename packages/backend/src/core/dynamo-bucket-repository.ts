import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { BucketRepository } from "./repositories";
import { BucketSummary } from "@bucket-pulse/shared";

interface DynamoBucketRepositoryProps {
  tableName: string;
  docClient: DynamoDBDocumentClient;
}

export class DynamoBucketRepository implements BucketRepository {
  private readonly tableName: string;
  private readonly docClient: DynamoDBDocumentClient;

  constructor(props: DynamoBucketRepositoryProps) {
    this.tableName = props.tableName;
    this.docClient = props.docClient;
  }

  private fromItem(item: Record<string, any>): BucketSummary {
    return {
      bucketName: item.bucket_name,
      displayName: item.display_name,
      region: item.region ?? "us-east-1",
      metadataTablesEnabled: !!item.metadata_tables_enabled,
      journalTablesEnabled: !!item.journal_tables_enabled,
      inventoryTableName: item.inventory_table_name,
      journalTableName: item.journal_table_name,
      metadataTablesArn: item.metadata_tables_arn,
      createdAt: item.created_at,
      status: item.status ?? "UNKNOWN",
      totalObjects: item.total_objects,
      totalBytes: item.total_bytes,
      trackedPrefixesCount: item.tracked_prefixes_count,
    };
  }

  private toItem(summary: BucketSummary): Record<string, any> {
    return {
      bucket_name: summary.bucketName,
      display_name: summary.displayName,
      region: summary.region,
      metadata_tables_enabled: summary.metadataTablesEnabled,
      journal_tables_enabled: summary.journalTablesEnabled,
      inventory_table_name: summary.inventoryTableName,
      journal_table_name: summary.journalTableName,
      metadata_tables_arn: summary.metadataTablesArn,
      created_at: summary.createdAt,
      status: summary.status,
      total_objects: summary.totalObjects,
      total_bytes: summary.totalBytes,
      tracked_prefixes_count: summary.trackedPrefixesCount,
    };
  }

  async listBuckets(): Promise<BucketSummary[]> {
    const resp = await this.docClient.send(new ScanCommand({ TableName: this.tableName }));
    return (resp.Items ?? []).map((i) => this.fromItem(i));
  }

  async getBucket(bucketName: string): Promise<BucketSummary | null> {
    const resp = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { bucket_name: bucketName },
      }),
    );
    return resp.Item ? this.fromItem(resp.Item) : null;
  }

  async upsertBucket(input: {
    bucketName: string;
    displayName?: string;
    region?: string;
    inventoryTableName?: string;
    journalTableName?: string;
    metadataTablesArn?: string;
  }): Promise<BucketSummary> {
    const existing = await this.getBucket(input.bucketName);
    const now = new Date().toISOString();
    const summary: BucketSummary = {
      bucketName: input.bucketName,
      displayName: input.displayName ?? existing?.displayName,
      region: input.region ?? existing?.region ?? "us-east-1",
      metadataTablesEnabled: existing?.metadataTablesEnabled ?? true,
      journalTablesEnabled: existing?.journalTablesEnabled ?? true,
      inventoryTableName: input.inventoryTableName ?? existing?.inventoryTableName,
      journalTableName: input.journalTableName ?? existing?.journalTableName,
      metadataTablesArn: input.metadataTablesArn ?? existing?.metadataTablesArn,
      createdAt: existing?.createdAt ?? now,
      status: existing?.status ?? "UNKNOWN",
      totalObjects: existing?.totalObjects,
      totalBytes: existing?.totalBytes,
      trackedPrefixesCount: existing?.trackedPrefixesCount,
    };
    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: this.toItem(summary),
      }),
    );
    return summary;
  }
}
