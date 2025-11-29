//
// Shared enums & helpers
//

export type BucketStatusCode = "OK" | "DEGRADING" | "STALLED" | "UNKNOWN";

export type PrefixStatusCode =
  | "OK"
  | "DEGRADING"
  | "STALLED"
  | "ANOMALOUS"
  | "UNKNOWN";

export type AlertSeverity = "INFO" | "WARN" | "CRITICAL";

export type AlertType =
  | "FRESHNESS"
  | "STALENESS"
  | "DELETE_SPIKE"
  | "GROWTH_SPIKE"
  | "OTHER";

export interface PaginatedResponse<T> {
  items: T[];
  /** Opaque token for fetching the next page; omitted if there is no next page */
  nextToken?: string;
}

export interface ApiErrorResponse {
  error: string; // short code, e.g. "NotFound", "ValidationError"
  message?: string; // human-readable explanation
  requestId?: string; // from API Gateway / Lambda context
}

//
// Core domain types
//

/**
 * Summary of a monitored bucket as returned to the UI.
 * Used in GET /buckets and embedded in other responses.
 */
export interface BucketSummary {
  bucketName: string;
  displayName?: string;
  region: string;

  metadataTablesEnabled: boolean;
  journalTablesEnabled: boolean;
  inventoryTableName?: string;
  journalTableName?: string;
  metadataTablesArn?: string;

  createdAt: string; // ISO-8601

  // Aggregated / derived fields (optional for MVP)
  totalObjects?: number;
  totalBytes?: number;
  trackedPrefixesCount?: number;

  status: BucketStatusCode; // e.g. "OK" if all prefixes OK, etc.
}

/**
 * Configuration for a tracked (bucket, prefix) pair.
 * Backed by bp_prefix_config.
 */
export interface PrefixConfig {
  bucketName: string;
  prefix: string;

  // Freshness expectations in minutes
  freshnessExpectedIntervalMinutes: number;
  freshnessWarningThresholdMinutes: number;
  freshnessCriticalThresholdMinutes: number;

  // Staleness thresholds
  stalenessAgeDays: number; // e.g. 90
  stalenessMaxPctOld: number; // e.g. 70 (percent of bytes or objects)

  // Optional partition pattern for time-series data
  partitionPattern?: string; // e.g. "logs/appA/date={YYYY-MM-DD}/hour={HH}/"

  createdAt: string; // ISO-8601
  updatedAt?: string; // ISO-8601
}

/**
 * Histogram of object ages by bucketed ranges (in days).
 * Counts are number of objects, not bytes, for simplicity.
 */
export interface AgeHistogram {
  "0_7": number;
  "7_30": number;
  "30_90": number;
  "90_plus": number;
}

/**
 * Storage class breakdown; map from storage class (STANDARD, GLACIER, etc.)
 * to counts (number of objects). You could switch this to bytes if you prefer.
 */
export interface StorageClassBreakdown {
  [storageClass: string]: number;
}

/**
 * Latest computed status & metrics for a (bucket, prefix).
 * Backed by bp_prefix_status.
 */
export interface PrefixStatus {
  bucketName: string;
  prefix: string;

  status: PrefixStatusCode;
  statusReason?: string; // short human-readable explanation
  lastEvaluatedAt: string; // ISO-8601

  // From journal table (recent window)
  lastEventTime?: string; // ISO-8601
  objectsCreatedLastWindow?: number;
  bytesCreatedLastWindow?: number;
  objectsDeletedLastWindow?: number;
  bytesDeletedLastWindow?: number;

  // From inventory table (current snapshot)
  totalObjects?: number;
  totalBytes?: number;

  ageHistogram?: AgeHistogram;
  storageClassBreakdown?: StorageClassBreakdown;
}

/**
 * Individual evaluation record (history). Mirrors PrefixStatus fields with an evaluatedAt key for ordering.
 */
export interface PrefixEvaluation extends PrefixStatus {
  evaluatedAt: string; // ISO-8601, usually same as lastEvaluatedAt
}

/**
 * Combined view of a prefix for list views: config + latest status.
 */
export interface PrefixSummary {
  config: PrefixConfig;
  status?: PrefixStatus; // may be undefined if not yet evaluated
}

/**
 * Alert record (historical log).
 * Backed by bp_alerts.
 */
export interface Alert {
  alertId: string;

  bucketName: string;
  prefix: string;

  type: AlertType;
  severity: AlertSeverity;

  message: string;
  details?: Record<string, unknown>; // any metrics that triggered this

  createdAt: string; // ISO-8601
  resolved: boolean;
}

/**
 * A single object row returned from the inventory explorer.
 */
export interface ExplorerObject {
  bucketName: string;
  key: string;
  sizeBytes: number;

  lastModified: string; // ISO-8601
  storageClass: string;

  etag?: string;
  tags?: Record<string, string>;
}

/**
 * Extra summary info for explorer queries (optional).
 */
export interface ExplorerSummary {
  totalObjects?: number;
  totalBytes?: number;
}

//
// Endpoint-specific responses
//

/**
 * GET /buckets
 */
export interface GetBucketsResponse {
  buckets: BucketSummary[];
}

/**
 * GET /buckets/{bucket}/prefixes
 */
export interface GetBucketPrefixesResponse {
  bucket: BucketSummary;
  prefixes: PrefixSummary[];
}

/**
 * GET /buckets/{bucket}/prefixes/{prefix}/health
 */
export interface GetPrefixHealthResponse {
  bucket: BucketSummary;
  prefix: string;

  config: PrefixConfig;
  status?: PrefixStatus; // may be undefined if aggregator hasn’t run yet
  evaluations?: PrefixEvaluation[];
  nextToken?: string;

  // Future extension points:
  // recentHistory?: PrefixEvaluation[];
}

/**
 * GET /buckets/{bucket}/prefixes/{prefix}/evaluations
 */
export interface GetPrefixEvaluationsResponse extends PaginatedResponse<PrefixEvaluation> {}

/**
 * GET /alerts
 *
 * Supports pagination.
 */
export interface GetAlertsResponse extends PaginatedResponse<Alert> {
  // You can add filter echoing here if you want:
  // filter?: { bucketName?: string; prefix?: string; severity?: AlertSeverity; ... };
}

/**
 * GET /explorer/query
 *
 * Returns paginated inventory rows plus optional aggregate summary.
 */
export interface ExplorerQueryResponse
  extends PaginatedResponse<ExplorerObject> {
  summary?: ExplorerSummary;
}
