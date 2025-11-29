export interface InventoryTableRef {
  database: string;
  table: string;
  fullyQualifiedName?: string;
}

export interface JournalTableRef {
  database: string;
  table: string;
  fullyQualifiedName?: string;
}

export interface SqlBuilderConfig {
  resolveInventoryTable(bucketName: string): InventoryTableRef;
  resolveJournalTable(bucketName: string): JournalTableRef;
}

export interface JournalWindowParams {
  bucketName: string;
  prefix: string;
  windowMinutes: number;
}

export function buildJournalWindowQuery(cfg: SqlBuilderConfig, params: JournalWindowParams): string {
  const ref = cfg.resolveJournalTable(params.bucketName);
  const tableExpr = ref.fullyQualifiedName ? ref.fullyQualifiedName : `"${ref.database}"."${ref.table}"`;
  return `
    SELECT
      MAX(event_time) AS last_event_time,
      SUM(CASE WHEN event_type LIKE 'ObjectCreated%' THEN 1 ELSE 0 END) AS objects_created,
      SUM(CASE WHEN event_type LIKE 'ObjectCreated%' THEN size_bytes ELSE 0 END) AS bytes_created,
      SUM(CASE WHEN event_type LIKE 'ObjectRemoved%' THEN 1 ELSE 0 END) AS objects_deleted,
      SUM(CASE WHEN event_type LIKE 'ObjectRemoved%' THEN size_bytes ELSE 0 END) AS bytes_deleted
    FROM ${tableExpr}
    WHERE bucket_name = '${escapeLiteral(params.bucketName)}'
      AND key LIKE '${escapeLiteral(params.prefix)}%'
      AND event_time >= current_timestamp - interval '${params.windowMinutes}' minute
  `;
}

export interface InventoryAggregatesParams {
  bucketName: string;
  prefix: string;
}

export function buildInventorySnapshotQuery(cfg: SqlBuilderConfig, params: InventoryAggregatesParams): string {
  const ref = cfg.resolveInventoryTable(params.bucketName);
  const tableExpr = ref.fullyQualifiedName ? ref.fullyQualifiedName : `"${ref.database}"."${ref.table}"`;
  return `
    SELECT
      COUNT(*) AS total_objects,
      SUM(size_bytes) AS total_bytes,
      SUM(CASE WHEN last_modified >= current_date - interval '7' day THEN 1 ELSE 0 END) AS age_0_7,
      SUM(CASE WHEN last_modified < current_date - interval '7' day AND last_modified >= current_date - interval '30' day THEN 1 ELSE 0 END) AS age_7_30,
      SUM(CASE WHEN last_modified < current_date - interval '30' day AND last_modified >= current_date - interval '90' day THEN 1 ELSE 0 END) AS age_30_90,
      SUM(CASE WHEN last_modified < current_date - interval '90' day THEN 1 ELSE 0 END) AS age_90_plus
    FROM ${tableExpr}
    WHERE bucket_name = '${escapeLiteral(params.bucketName)}'
      AND key LIKE '${escapeLiteral(params.prefix)}%'
  `;
}

export function buildInventoryStorageClassQuery(cfg: SqlBuilderConfig, params: InventoryAggregatesParams): string {
  const ref = cfg.resolveInventoryTable(params.bucketName);
  const tableExpr = ref.fullyQualifiedName ? ref.fullyQualifiedName : `"${ref.database}"."${ref.table}"`;
  return `
    SELECT storage_class, COUNT(*) AS object_count
    FROM ${tableExpr}
    WHERE bucket_name = '${escapeLiteral(params.bucketName)}'
      AND key LIKE '${escapeLiteral(params.prefix)}%'
    GROUP BY storage_class
  `;
}

export function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}
