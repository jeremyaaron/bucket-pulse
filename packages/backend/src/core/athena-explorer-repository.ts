import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  QueryExecutionState,
  StartQueryExecutionCommand,
} from "@aws-sdk/client-athena";
import { ExplorerObject, ExplorerQueryResponse } from "@bucket-pulse/shared";
import { ExplorerRepository } from "./repositories";

interface AthenaExplorerRepositoryProps {
  athenaClient: AthenaClient;
  workGroup: string;
  resultLocation: string;
  resolveInventoryTable: (bucketName: string) => Promise<{ database: string; table: string; fullyQualifiedName?: string }>;
}

interface NextTokenPayload {
  queryExecutionId: string;
  resultNextToken?: string;
}

export class AthenaExplorerRepository implements ExplorerRepository {
  private readonly athena: AthenaClient;
  private readonly workGroup: string;
  private readonly resultLocation: string;
  private readonly resolveInventoryTable: AthenaExplorerRepositoryProps["resolveInventoryTable"];

  constructor(props: AthenaExplorerRepositoryProps) {
    this.athena = props.athenaClient;
    this.workGroup = props.workGroup;
    this.resultLocation = props.resultLocation;
    this.resolveInventoryTable = props.resolveInventoryTable;
  }

  async queryInventory(params: {
    bucketName: string;
    prefix?: string;
    minSizeBytes?: number;
    maxSizeBytes?: number;
    minAgeDays?: number;
    maxAgeDays?: number;
    storageClass?: string;
    tagKey?: string;
    tagValue?: string;
    limit: number;
    nextToken?: string;
  }): Promise<ExplorerQueryResponse> {
    if (params.nextToken) {
      const decoded = this.decodeNextToken(params.nextToken);
      return this.fetchPage(params.limit, decoded.queryExecutionId, decoded.resultNextToken);
    }

    const tableRef = await this.resolveInventoryTable(params.bucketName);
    const tableExpr = tableRef.fullyQualifiedName
      ? tableRef.fullyQualifiedName
      : `"${tableRef.database}"."${tableRef.table}"`;
    const queryString = this.buildQuery({ tableExpr, ...params });

    const startResp = await this.athena.send(
      new StartQueryExecutionCommand({
        QueryString: queryString,
        WorkGroup: this.workGroup,
        ResultConfiguration: { OutputLocation: this.resultLocation },
      }),
    );
    const queryExecutionId = startResp.QueryExecutionId;
    if (!queryExecutionId) {
      throw new Error("Failed to start Athena query (no id)");
    }

    await this.waitForSuccess(queryExecutionId);
    return this.fetchPage(params.limit, queryExecutionId, undefined);
  }

  private buildQuery(input: {
    tableExpr: string;
    bucketName: string;
    prefix?: string;
    minSizeBytes?: number;
    maxSizeBytes?: number;
    minAgeDays?: number;
    maxAgeDays?: number;
    storageClass?: string;
    tagKey?: string;
    tagValue?: string;
  }) {
    const where: string[] = [`bucket_name = '${this.escape(input.bucketName)}'`];
    if (input.prefix) where.push(`key LIKE '${this.escape(input.prefix)}%'`);
    if (typeof input.minSizeBytes === "number") where.push(`size_bytes >= ${input.minSizeBytes}`);
    if (typeof input.maxSizeBytes === "number") where.push(`size_bytes <= ${input.maxSizeBytes}`);
    if (typeof input.minAgeDays === "number") where.push(`date_diff('day', last_modified, current_date) >= ${input.minAgeDays}`);
    if (typeof input.maxAgeDays === "number") where.push(`date_diff('day', last_modified, current_date) <= ${input.maxAgeDays}`);
    if (input.storageClass) where.push(`storage_class = '${this.escape(input.storageClass)}'`);
    if (input.tagKey) {
      if (input.tagValue) {
        where.push(`json_extract_scalar(tags_json, '$.${this.escape(input.tagKey)}') = '${this.escape(input.tagValue)}'`);
      } else {
        where.push(`json_extract_scalar(tags_json, '$.${this.escape(input.tagKey)}') IS NOT NULL`);
      }
    }
    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    return `
      SELECT bucket_name, key, size_bytes, last_modified, storage_class, etag, tags_json
      FROM ${input.tableExpr}
      ${whereClause}
      ORDER BY key
    `;
  }

  private escape(value: string): string {
    return value.replace(/'/g, "''");
  }

  private async waitForSuccess(queryExecutionId: string) {
    for (;;) {
      const resp = await this.athena.send(new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId }));
      const state = resp.QueryExecution?.Status?.State as QueryExecutionState;
      if (state === "SUCCEEDED") return;
      if (state === "FAILED" || state === "CANCELLED") {
        const reason = resp.QueryExecution?.Status?.StateChangeReason;
        throw new Error(`Athena query failed (${state}): ${reason}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  private async fetchPage(limit: number, queryExecutionId: string, nextToken?: string): Promise<ExplorerQueryResponse> {
    const resp = await this.athena.send(
      new GetQueryResultsCommand({
        QueryExecutionId: queryExecutionId,
        MaxResults: limit,
        NextToken: nextToken,
      }),
    );
    const rows = resp.ResultSet?.Rows ?? [];
    if (rows.length === 0) {
      return { items: [] };
    }
    const header = rows[0].Data ?? [];
    const cols = header.map((c) => c.VarCharValue ?? "");
    const items: ExplorerObject[] = rows.slice(1).map((row) => this.mapRow(cols, row.Data ?? []));

    const tokenPayload: NextTokenPayload | undefined = resp.NextToken
      ? { queryExecutionId, resultNextToken: resp.NextToken }
      : undefined;

    return { items, nextToken: tokenPayload ? this.encodeNextToken(tokenPayload) : undefined };
  }

  private mapRow(columns: string[], data: { VarCharValue?: string }[]): ExplorerObject {
    const record: Record<string, string> = {};
    columns.forEach((col, idx) => {
      record[col] = data[idx]?.VarCharValue ?? "";
    });
    return {
      bucketName: record["bucket_name"],
      key: record["key"],
      sizeBytes: Number.parseInt(record["size_bytes"] ?? "0", 10) || 0,
      lastModified: record["last_modified"],
      storageClass: record["storage_class"],
      etag: record["etag"] || undefined,
      tags: this.parseTags(record["tags_json"]),
    };
  }

  private parseTags(raw?: string): Record<string, string> | undefined {
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const result: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          result[k] = typeof v === "string" ? v : String(v);
        }
        return result;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  private encodeNextToken(payload: NextTokenPayload): string {
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  }

  private decodeNextToken(token: string): NextTokenPayload {
    return JSON.parse(Buffer.from(token, "base64").toString("utf8")) as NextTokenPayload;
  }
}
