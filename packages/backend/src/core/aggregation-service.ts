import {
  Alert,
  AlertSeverity,
  AlertType,
  PrefixConfig,
  PrefixStatus,
  PrefixStatusCode,
} from "@bucket-pulse/shared";
import {
  AggregationService,
  AlertRepository,
  BucketRepository,
  PrefixConfigRepository,
  PrefixStatusRepository,
  PrefixEvaluationRepository,
} from "./repositories";
import { AthenaRunner } from "./athena-helpers";
import {
  SqlBuilderConfig,
  buildInventorySnapshotQuery,
  buildInventoryStorageClassQuery,
  buildJournalWindowQuery,
} from "./sql-builder";

interface AggregationDeps {
  prefixConfigRepo: PrefixConfigRepository;
  prefixStatusRepo: PrefixStatusRepository;
  alertRepo: AlertRepository;
  evaluationRepo: PrefixEvaluationRepository;
  bucketRepo: BucketRepository;
  athena: AthenaRunner;
  sqlBuilderConfig: SqlBuilderConfig;
  journalWindowMinutes: number;
}

export class DefaultAggregationService implements AggregationService {
  constructor(private readonly deps: AggregationDeps) {}

  async runAggregationCycle(): Promise<void> {
    const configs = await this.deps.prefixConfigRepo.listAll();
    for (const config of configs) {
      try {
        const bucket = await this.deps.bucketRepo.getBucket(config.bucketName);
        const previous = await this.deps.prefixStatusRepo.get(config.bucketName, config.prefix);
        const status = await this.computeStatus(config, bucket);
        await this.deps.prefixStatusRepo.save(status);
        await this.deps.evaluationRepo.save({
          ...status,
          evaluatedAt: status.lastEvaluatedAt,
        });
        await this.maybeCreateAlert(config, status, previous ?? undefined);
      } catch (err) {
        console.error(`Failed to aggregate ${config.bucketName}/${config.prefix}`, err);
      }
    }
  }

  private async computeStatus(config: PrefixConfig, bucket: any): Promise<PrefixStatus> {
    const now = new Date().toISOString();
    const tableResolver = this.resolveTables(bucket);
    const journal = await this.queryJournalMetrics(config, tableResolver);
    const inventory = await this.queryInventoryMetrics(config, tableResolver);
    const { code, reason } = this.evaluateStatus(config, journal, inventory, now);

    return {
      bucketName: config.bucketName,
      prefix: config.prefix,
      status: code,
      statusReason: reason,
      lastEvaluatedAt: now,
      lastEventTime: journal.lastEventTime,
      objectsCreatedLastWindow: journal.objectsCreated,
      bytesCreatedLastWindow: journal.bytesCreated,
      objectsDeletedLastWindow: journal.objectsDeleted,
      bytesDeletedLastWindow: journal.bytesDeleted,
      totalObjects: inventory.totalObjects,
      totalBytes: inventory.totalBytes,
      ageHistogram: inventory.ageHistogram,
      storageClassBreakdown: inventory.storageClassBreakdown,
    };
  }

  private async queryJournalMetrics(
    config: PrefixConfig,
    tableResolver: SqlBuilderConfig,
  ): Promise<{
    lastEventTime?: string;
    objectsCreated: number;
    bytesCreated: number;
    objectsDeleted: number;
    bytesDeleted: number;
  }> {
    const sql = buildJournalWindowQuery(tableResolver, {
      bucketName: config.bucketName,
      prefix: config.prefix,
      windowMinutes: this.deps.journalWindowMinutes,
    });
    const row = await this.deps.athena.runSingleRowQuery(sql);
    const idx = (name: string) => row?.columns.findIndex((c) => c.toLowerCase() === name.toLowerCase()) ?? -1;
    const getNum = (name: string) => {
      if (!row) return 0;
      const i = idx(name);
      const raw = i >= 0 ? row.values[i] : null;
      const n = raw ? Number.parseInt(raw, 10) : 0;
      return Number.isNaN(n) ? 0 : n;
    };
    const getStr = (name: string) => {
      if (!row) return undefined;
      const i = idx(name);
      return i >= 0 ? row.values[i] ?? undefined : undefined;
    };
    return {
      lastEventTime: getStr("last_event_time"),
      objectsCreated: getNum("objects_created"),
      bytesCreated: getNum("bytes_created"),
      objectsDeleted: getNum("objects_deleted"),
      bytesDeleted: getNum("bytes_deleted"),
    };
  }

  private async queryInventoryMetrics(
    config: PrefixConfig,
    tableResolver: SqlBuilderConfig,
  ): Promise<{
    totalObjects: number;
    totalBytes: number;
    ageHistogram: PrefixStatus["ageHistogram"];
    storageClassBreakdown: PrefixStatus["storageClassBreakdown"];
  }> {
    const snapshotSql = buildInventorySnapshotQuery(tableResolver, {
      bucketName: config.bucketName,
      prefix: config.prefix,
    });
    const snapshot = await this.deps.athena.runSingleRowQuery(snapshotSql);
    const idx = (name: string) => snapshot?.columns.findIndex((c) => c.toLowerCase() === name.toLowerCase()) ?? -1;
    const getNum = (name: string) => {
      if (!snapshot) return 0;
      const i = idx(name);
      const raw = i >= 0 ? snapshot.values[i] : null;
      const n = raw ? Number.parseInt(raw, 10) : 0;
      return Number.isNaN(n) ? 0 : n;
    };
    const totalObjects = getNum("total_objects");
    const totalBytes = getNum("total_bytes");
    const ageHistogram: PrefixStatus["ageHistogram"] = {
      "0_7": getNum("age_0_7"),
      "7_30": getNum("age_7_30"),
      "30_90": getNum("age_30_90"),
      "90_plus": getNum("age_90_plus"),
    };

    const scSql = buildInventoryStorageClassQuery(tableResolver, {
      bucketName: config.bucketName,
      prefix: config.prefix,
    });
    const rows = await this.deps.athena.runMultiRowQuery(scSql);
    const storageClassBreakdown: PrefixStatus["storageClassBreakdown"] = {};
    rows.forEach((r) => {
      storageClassBreakdown[r["storage_class"]] = Number.parseInt(r["object_count"] ?? "0", 10) || 0;
    });

    return { totalObjects, totalBytes, ageHistogram, storageClassBreakdown };
  }

  private evaluateStatus(
    config: PrefixConfig,
    journal: { lastEventTime?: string; objectsCreated: number; bytesCreated: number; bytesDeleted: number },
    inventory: { totalObjects: number; totalBytes: number; ageHistogram?: PrefixStatus["ageHistogram"] },
    nowIso: string,
  ): { code: PrefixStatusCode; reason: string } {
    let code: PrefixStatusCode = "OK";
    let reason = "Healthy";

    // Freshness check
    if (!journal.lastEventTime) {
      code = "UNKNOWN";
      reason = "No events observed in the journal window.";
    } else {
      const last = new Date(journal.lastEventTime).getTime();
      const now = new Date(nowIso).getTime();
      const diffMinutes = (now - last) / 60000;
      if (diffMinutes > config.freshnessCriticalThresholdMinutes) {
        code = "STALLED";
        reason = `No events for ${Math.round(diffMinutes)}m (critical ${config.freshnessCriticalThresholdMinutes}m).`;
      } else if (diffMinutes > config.freshnessWarningThresholdMinutes) {
        code = "DEGRADING";
        reason = `No events for ${Math.round(diffMinutes)}m (warning ${config.freshnessWarningThresholdMinutes}m).`;
      }
    }

    // Staleness check
    if (inventory.totalObjects > 0 && inventory.ageHistogram) {
      const oldPct = (inventory.ageHistogram["90_plus"] / inventory.totalObjects) * 100;
      if (oldPct > config.stalenessMaxPctOld) {
        if (code === "OK" || code === "UNKNOWN") {
          code = "DEGRADING";
          reason = `Old data ${oldPct.toFixed(1)}% exceeds threshold ${config.stalenessMaxPctOld}%.`;
        } else {
          reason += ` Staleness breach: ${oldPct.toFixed(1)}% > ${config.stalenessMaxPctOld}%.`;
        }
      }
    }

    // Simple anomaly: large delete spike relative to size
    const deletePct = inventory.totalBytes > 0 ? (journal.bytesDeleted / Math.max(inventory.totalBytes, 1)) * 100 : 0;
    if (deletePct > 30) {
      code = "ANOMALOUS";
      reason = `Delete spike: removed ${(journal.bytesDeleted / 1_000_000_000).toFixed(2)} GB (~${deletePct.toFixed(
        1,
      )}%) in window.`;
    }

    return { code, reason };
  }

  private async maybeCreateAlert(config: PrefixConfig, status: PrefixStatus, previous?: PrefixStatus): Promise<void> {
    const currentSeverity = this.statusToSeverity(status.status);
    if (!currentSeverity) return;

    const previousSeverity = previous ? this.statusToSeverity(previous.status) : undefined;
    const severityRank = (s: AlertSeverity) => (s === "CRITICAL" ? 3 : s === "WARN" ? 2 : 1);

    // Only alert on first entry into non-OK or when severity worsens.
    const shouldAlert =
      !previousSeverity ||
      severityRank(currentSeverity) > severityRank(previousSeverity) ||
      (previous?.status !== status.status);

    if (!shouldAlert) return;

    const alert: Omit<Alert, "alertId" | "createdAt"> = {
      bucketName: config.bucketName,
      prefix: config.prefix,
      type: status.status === "STALLED" ? "FRESHNESS" : status.status === "DEGRADING" ? "FRESHNESS" : "STALENESS",
      severity: currentSeverity,
      message: status.statusReason ?? "Threshold breached",
      details: {
        status: status.status,
        lastEventTime: status.lastEventTime,
        totalObjects: status.totalObjects,
      },
      resolved: false,
    };
    await this.deps.alertRepo.create(alert);
  }

  private statusToSeverity(code: PrefixStatusCode): AlertSeverity | undefined {
    switch (code) {
      case "STALLED":
        return "CRITICAL";
      case "DEGRADING":
      case "ANOMALOUS":
        return "WARN";
      default:
        return undefined;
    }
  }

  private resolveTables(bucket: any): SqlBuilderConfig {
    const base = this.deps.sqlBuilderConfig;
    const invRef =
      bucket?.inventoryTableName && typeof bucket.inventoryTableName === "string"
        ? this.parseTable(bucket.inventoryTableName)
        : undefined;
    const jnRef =
      bucket?.journalTableName && typeof bucket.journalTableName === "string"
        ? this.parseTable(bucket.journalTableName)
        : undefined;

    return {
      resolveInventoryTable: (bucketName: string) => invRef ?? base.resolveInventoryTable(bucketName),
      resolveJournalTable: (bucketName: string) => jnRef ?? base.resolveJournalTable(bucketName),
    };
  }

  private parseTable(tableName: string): { database: string; table: string; fullyQualifiedName: string } {
    if (tableName.includes(".")) {
      const parts = tableName.split(".");
      const db = parts.slice(0, -1).join(".");
      const tbl = parts[parts.length - 1];
      const fq = `"${db}"."${tbl}"`;
      return { database: db, table: tbl, fullyQualifiedName: fq };
    }
    return {
      database: "",
      table: tableName,
      fullyQualifiedName: `"${tableName}"`,
    };
  }
}
