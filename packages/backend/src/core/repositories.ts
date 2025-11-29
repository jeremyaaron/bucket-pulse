import {
  Alert,
  AlertSeverity,
  AlertType,
  BucketSummary,
  ExplorerQueryResponse,
  GetPrefixEvaluationsResponse,
  PrefixEvaluation,
  PrefixConfig,
  PrefixStatus,
  GetAlertsResponse,
} from "@bucket-pulse/shared";

/**
 * Encapsulates access to bp_buckets (and any aggregate status derived from other tables).
 */
export interface BucketRepository {
  listBuckets(options?: { includeAggregates?: boolean }): Promise<BucketSummary[]>;
  getBucket(bucketName: string): Promise<BucketSummary | null>;
  upsertBucket(input: { bucketName: string; displayName?: string; region?: string }): Promise<BucketSummary>;
}

/**
 * Encapsulates access to bp_prefix_config.
 */
export interface PrefixConfigRepository {
  listByBucket(bucketName: string): Promise<PrefixConfig[]>;
  get(bucketName: string, prefix: string): Promise<PrefixConfig | null>;
  upsert(config: Omit<PrefixConfig, "createdAt" | "updatedAt">): Promise<PrefixConfig>;
  listAll(): Promise<PrefixConfig[]>;
}

/**
 * Encapsulates access to bp_prefix_status.
 */
export interface PrefixStatusRepository {
  get(bucketName: string, prefix: string): Promise<PrefixStatus | null>;
  save(status: PrefixStatus): Promise<void>;
  listByBucket(bucketName: string): Promise<PrefixStatus[]>;
}

/**
 * Encapsulates access to bp_alerts.
 */
export interface AlertRepository {
  listAlerts(filters: {
    bucketName?: string;
    prefix?: string;
    severity?: AlertSeverity;
    type?: AlertType;
    since?: string;
    until?: string;
    limit: number;
    nextToken?: string;
  }): Promise<GetAlertsResponse>;
  create(alert: Omit<Alert, "alertId" | "createdAt">): Promise<Alert>;
  markResolved(alertId: string): Promise<void>;
}

/**
 * Encapsulates querying of S3 metadata inventory via Athena or S3 Tables.
 */
export interface ExplorerRepository {
  queryInventory(params: {
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
  }): Promise<ExplorerQueryResponse>;
}

/**
 * High-level service for prefix health endpoints, combining repos.
 */
export interface PrefixHealthService {
  getPrefixHealth(params: {
    bucketName: string;
    prefix: string;
  }): Promise<{ bucket: BucketSummary; config: PrefixConfig; status?: PrefixStatus } | null>;
}

/**
 * High-level service used by AggregatorLambda.
 */
export interface AggregationService {
  runAggregationCycle(): Promise<void>;
}

/**
 * History of prefix evaluations.
 */
export interface PrefixEvaluationRepository {
  save(evaluation: PrefixEvaluation): Promise<void>;
  listByPrefix(
    bucketName: string,
    prefix: string,
    options?: { limit?: number; nextToken?: string; since?: string }
  ): Promise<GetPrefixEvaluationsResponse>;
}
