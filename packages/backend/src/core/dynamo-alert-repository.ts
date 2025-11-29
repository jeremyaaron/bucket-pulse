import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import crypto from "crypto";
import { Alert, AlertSeverity, AlertType, GetAlertsResponse } from "@bucket-pulse/shared";
import { AlertRepository } from "./repositories";

interface DynamoAlertRepositoryProps {
  tableName: string;
  byBucketIndexName: string;
  docClient: DynamoDBDocumentClient;
}

export class DynamoAlertRepository implements AlertRepository {
  private readonly tableName: string;
  private readonly byBucketIndexName: string;
  private readonly docClient: DynamoDBDocumentClient;

  constructor(props: DynamoAlertRepositoryProps) {
    this.tableName = props.tableName;
    this.byBucketIndexName = props.byBucketIndexName;
    this.docClient = props.docClient;
  }

  async listAlerts(filters: {
    bucketName?: string;
    prefix?: string;
    severity?: AlertSeverity;
    type?: AlertType;
    since?: string;
    until?: string;
    limit: number;
    nextToken?: string;
  }): Promise<GetAlertsResponse> {
    // Prefer GSI by bucket when bucket filter exists; otherwise scan (MVP).
    const useGsi = !!filters.bucketName;
    const decodeToken = (token?: string) => (token ? JSON.parse(Buffer.from(token, "base64").toString("utf8")) : undefined);
    const encodeToken = (key: Record<string, any>) => Buffer.from(JSON.stringify(key), "utf8").toString("base64");

    const exclusiveStartKey = decodeToken(filters.nextToken);

    if (useGsi) {
      const expr: string[] = ["bucket_name = :b"];
      const values: Record<string, any> = { ":b": filters.bucketName };
      if (filters.prefix) {
        expr.push("prefix = :p");
        values[":p"] = filters.prefix;
      }
      if (filters.severity) {
        expr.push("severity = :s");
        values[":s"] = filters.severity;
      }
      if (filters.type) {
        expr.push("#t = :t");
        values[":t"] = filters.type;
      }
      if (filters.since) {
        expr.push("created_at >= :since");
        values[":since"] = filters.since;
      }
      if (filters.until) {
        expr.push("created_at <= :until");
        values[":until"] = filters.until;
      }

      const resp = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: this.byBucketIndexName,
          KeyConditionExpression: expr.join(" AND "),
          ExpressionAttributeValues: values,
          ExpressionAttributeNames: filters.type ? { "#t": "type" } : undefined,
          Limit: filters.limit,
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      return {
        items: (resp.Items as Alert[] | undefined) ?? [],
        nextToken: resp.LastEvaluatedKey ? encodeToken(resp.LastEvaluatedKey) : undefined,
      };
    }

    // Fallback scan for cross-bucket queries; filtered client-side for simplicity.
    const scanResp = await this.docClient.send(
      new ScanCommand({
        TableName: this.tableName,
        Limit: filters.limit,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    let items = (scanResp.Items as Alert[] | undefined) ?? [];
    items = items.filter((a) => {
      if (filters.prefix && a.prefix !== filters.prefix) return false;
      if (filters.severity && a.severity !== filters.severity) return false;
      if (filters.type && a.type !== filters.type) return false;
      if (filters.since && a.createdAt < filters.since) return false;
      if (filters.until && a.createdAt > filters.until) return false;
      return true;
    });

    return {
      items,
      nextToken: scanResp.LastEvaluatedKey ? encodeToken(scanResp.LastEvaluatedKey) : undefined,
    };
  }

  async create(alert: Omit<Alert, "alertId" | "createdAt">): Promise<Alert> {
    const full: Alert = {
      ...alert,
      alertId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          alert_id: full.alertId,
          bucket_name: full.bucketName,
          prefix: full.prefix,
          type: full.type,
          severity: full.severity,
          message: full.message,
          details: full.details,
          created_at: full.createdAt,
          resolved: full.resolved,
        },
      }),
    );
    return full;
  }

  async markResolved(alertId: string): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { alert_id: alertId },
        UpdateExpression: "SET resolved = :r",
        ExpressionAttributeValues: { ":r": true },
      }),
    );
  }
}
