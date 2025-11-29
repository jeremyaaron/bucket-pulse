import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  QueryExecutionState,
  StartQueryExecutionCommand,
} from "@aws-sdk/client-athena";

export interface AthenaConfig {
  workGroup: string;
  resultLocation: string;
}

export class AthenaRunner {
  constructor(private readonly client: AthenaClient, private readonly cfg: AthenaConfig) {}

  async runSingleRowQuery(queryString: string, maxWaitMs = 30_000): Promise<{ columns: string[]; values: (string | null)[] } | null> {
    const queryExecutionId = await this.startQuery(queryString);
    await this.waitForSuccess(queryExecutionId, maxWaitMs);
    const results = await this.client.send(
      new GetQueryResultsCommand({
        QueryExecutionId: queryExecutionId,
        MaxResults: 2,
      }),
    );
    const rows = results.ResultSet?.Rows ?? [];
    if (rows.length < 2) return null;
    const headerCells = rows[0].Data ?? [];
    const dataCells = rows[1].Data ?? [];
    const columns = headerCells.map((c) => c.VarCharValue ?? "");
    const values = dataCells.map((c) => c.VarCharValue ?? null);
    return { columns, values };
  }

  async runMultiRowQuery(queryString: string, maxWaitMs = 30_000): Promise<Array<Record<string, string>>> {
    const queryExecutionId = await this.startQuery(queryString);
    await this.waitForSuccess(queryExecutionId, maxWaitMs);
    const results = await this.client.send(
      new GetQueryResultsCommand({
        QueryExecutionId: queryExecutionId,
        MaxResults: 1000,
      }),
    );
    const rows = results.ResultSet?.Rows ?? [];
    if (rows.length < 2) return [];
    const headerCells = rows[0].Data ?? [];
    const columns = headerCells.map((c) => c.VarCharValue ?? "");
    const dataRows = rows.slice(1);
    return dataRows.map((row) => {
      const cells = row.Data ?? [];
      const record: Record<string, string> = {};
      columns.forEach((col, idx) => {
        record[col] = cells[idx]?.VarCharValue ?? "";
      });
      return record;
    });
  }

  private async startQuery(queryString: string): Promise<string> {
    const resp = await this.client.send(
      new StartQueryExecutionCommand({
        QueryString: queryString,
        WorkGroup: this.cfg.workGroup,
        ResultConfiguration: { OutputLocation: this.cfg.resultLocation },
      }),
    );
    if (!resp.QueryExecutionId) throw new Error("Failed to start Athena query");
    return resp.QueryExecutionId;
  }

  private async waitForSuccess(queryExecutionId: string, maxWaitMs: number): Promise<void> {
    const start = Date.now();
    for (;;) {
      const resp = await this.client.send(new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId }));
      const state = resp.QueryExecution?.Status?.State as QueryExecutionState;
      if (state === "SUCCEEDED") return;
      if (state === "FAILED" || state === "CANCELLED") {
        const reason = resp.QueryExecution?.Status?.StateChangeReason;
        throw new Error(`Athena query failed (${state}): ${reason ?? "unknown"}`);
      }
      if (Date.now() - start > maxWaitMs) throw new Error(`Athena query ${queryExecutionId} timed out`);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}
