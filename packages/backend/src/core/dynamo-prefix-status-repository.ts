import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { PrefixStatus } from "@bucket-pulse/shared";
import { PrefixStatusRepository } from "./repositories";

interface DynamoPrefixStatusRepositoryProps {
  tableName: string;
  docClient: DynamoDBDocumentClient;
}

export class DynamoPrefixStatusRepository implements PrefixStatusRepository {
  private readonly tableName: string;
  private readonly docClient: DynamoDBDocumentClient;

  constructor(props: DynamoPrefixStatusRepositoryProps) {
    this.tableName = props.tableName;
    this.docClient = props.docClient;
  }

  private fromItem(item: Record<string, any>): PrefixStatus {
    return {
      bucketName: item.bucket_name,
      prefix: item.prefix,
      status: item.status,
      statusReason: item.status_reason,
      lastEvaluatedAt: item.last_evaluated_at,
      lastEventTime: item.last_event_time,
      objectsCreatedLastWindow: item.objects_created_last_window,
      bytesCreatedLastWindow: item.bytes_created_last_window,
      objectsDeletedLastWindow: item.objects_deleted_last_window,
      bytesDeletedLastWindow: item.bytes_deleted_last_window,
      totalObjects: item.total_objects,
      totalBytes: item.total_bytes,
      ageHistogram: item.age_histogram,
      storageClassBreakdown: item.storage_class_breakdown,
    };
  }

  private toItem(status: PrefixStatus): Record<string, any> {
    return {
      bucket_name: status.bucketName,
      prefix: status.prefix,
      status: status.status,
      status_reason: status.statusReason,
      last_evaluated_at: status.lastEvaluatedAt,
      last_event_time: status.lastEventTime,
      objects_created_last_window: status.objectsCreatedLastWindow,
      bytes_created_last_window: status.bytesCreatedLastWindow,
      objects_deleted_last_window: status.objectsDeletedLastWindow,
      bytes_deleted_last_window: status.bytesDeletedLastWindow,
      total_objects: status.totalObjects,
      total_bytes: status.totalBytes,
      age_histogram: status.ageHistogram,
      storage_class_breakdown: status.storageClassBreakdown,
    };
  }

  async get(bucketName: string, prefix: string): Promise<PrefixStatus | null> {
    const resp = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { bucket_name: bucketName, prefix },
      }),
    );
    return resp.Item ? this.fromItem(resp.Item) : null;
  }

  async save(status: PrefixStatus): Promise<void> {
    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: this.toItem(status),
      }),
    );
  }

  async listByBucket(bucketName: string): Promise<PrefixStatus[]> {
    const resp = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "bucket_name = :b",
        ExpressionAttributeValues: { ":b": bucketName },
      }),
    );
    return (resp.Items ?? []).map((i) => this.fromItem(i));
  }
}
