import { DynamoDBDocumentClient, QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { PrefixEvaluation } from "@bucket-pulse/shared";
import { PrefixEvaluationRepository } from "./repositories";

interface PrefixEvaluationRepoProps {
  tableName: string;
  docClient: DynamoDBDocumentClient;
}

export class DynamoPrefixEvaluationRepository implements PrefixEvaluationRepository {
  private readonly pkName = "bucket_prefix";
  private readonly skName = "evaluated_at";

  constructor(private readonly props: PrefixEvaluationRepoProps) {}

  async save(evaluation: PrefixEvaluation): Promise<void> {
    const pk = this.pkValue(evaluation.bucketName, evaluation.prefix);
    await this.props.docClient.send(
      new PutCommand({
        TableName: this.props.tableName,
        Item: {
          [this.pkName]: pk,
          [this.skName]: evaluation.evaluatedAt,
          bucket_name: evaluation.bucketName,
          prefix: evaluation.prefix,
          status: evaluation.status,
          status_reason: evaluation.statusReason,
          last_evaluated_at: evaluation.lastEvaluatedAt,
          last_event_time: evaluation.lastEventTime,
          objects_created_last_window: evaluation.objectsCreatedLastWindow,
          bytes_created_last_window: evaluation.bytesCreatedLastWindow,
          objects_deleted_last_window: evaluation.objectsDeletedLastWindow,
          bytes_deleted_last_window: evaluation.bytesDeletedLastWindow,
          total_objects: evaluation.totalObjects,
          total_bytes: evaluation.totalBytes,
          age_histogram: evaluation.ageHistogram,
          storage_class_breakdown: evaluation.storageClassBreakdown,
        },
      })
    );
  }

  async listByPrefix(
    bucketName: string,
    prefix: string,
    options?: { limit?: number; nextToken?: string; since?: string }
  ): Promise<{ items: PrefixEvaluation[]; nextToken?: string }> {
    const pk = this.pkValue(bucketName, prefix);
    const expressions = ["#pk = :pk"];
    const exprNames: Record<string, string> = { "#pk": this.pkName };
    const exprValues: Record<string, any> = { ":pk": pk };
    if (options?.since) {
      expressions.push("#sk >= :since");
      exprNames["#sk"] = this.skName;
      exprValues[":since"] = options.since;
    }
    const resp = await this.props.docClient.send(
      new QueryCommand({
        TableName: this.props.tableName,
        KeyConditionExpression: expressions.join(" AND "),
        ExpressionAttributeNames: exprNames,
        ExpressionAttributeValues: exprValues,
        ScanIndexForward: false,
        Limit: options?.limit,
        ExclusiveStartKey: options?.nextToken ? JSON.parse(options.nextToken) : undefined,
      })
    );
    const items: PrefixEvaluation[] =
      resp.Items?.map((it) => ({
        bucketName,
        prefix,
        status: it.status,
        statusReason: it.status_reason,
        lastEvaluatedAt: it.last_evaluated_at,
        lastEventTime: it.last_event_time,
        objectsCreatedLastWindow: it.objects_created_last_window,
        bytesCreatedLastWindow: it.bytes_created_last_window,
        objectsDeletedLastWindow: it.objects_deleted_last_window,
        bytesDeletedLastWindow: it.bytes_deleted_last_window,
        totalObjects: it.total_objects,
        totalBytes: it.total_bytes,
        ageHistogram: it.age_histogram,
        storageClassBreakdown: it.storage_class_breakdown,
        evaluatedAt: it[this.skName],
      })) ?? [];
    const nextToken = resp.LastEvaluatedKey ? JSON.stringify(resp.LastEvaluatedKey) : undefined;
    return { items, nextToken };
  }

  private pkValue(bucketName: string, prefix: string): string {
    return `${bucketName}#${prefix}`;
  }
}
