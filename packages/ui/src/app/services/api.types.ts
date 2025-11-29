export interface PaginatedResponse<T> {
  items: T[];
  nextToken?: string;
}

export type BucketStatusCode = 'OK' | 'DEGRADING' | 'STALLED' | 'UNKNOWN';
export type PrefixStatusCode = 'OK' | 'DEGRADING' | 'STALLED' | 'ANOMALOUS' | 'UNKNOWN';
export type AlertSeverity = 'INFO' | 'WARN' | 'CRITICAL';
export type AlertType = 'FRESHNESS' | 'STALENESS' | 'DELETE_SPIKE' | 'GROWTH_SPIKE' | 'OTHER';

export interface BucketSummary {
  bucketName: string;
  displayName?: string;
  region: string;
  metadataTablesEnabled: boolean;
  journalTablesEnabled: boolean;
  createdAt: string;
  totalObjects?: number;
  totalBytes?: number;
  trackedPrefixesCount?: number;
  status: BucketStatusCode;
  lastEvaluatedAt?: string;
}

export interface PrefixConfig {
  bucketName: string;
  prefix: string;
  freshnessExpectedIntervalMinutes: number;
  freshnessWarningThresholdMinutes: number;
  freshnessCriticalThresholdMinutes: number;
  stalenessAgeDays: number;
  stalenessMaxPctOld: number;
  partitionPattern?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AgeHistogram {
  '0_7': number;
  '7_30': number;
  '30_90': number;
  '90_plus': number;
}

export interface StorageClassBreakdown {
  [storageClass: string]: number;
}

export interface PrefixStatus {
  bucketName: string;
  prefix: string;
  status: PrefixStatusCode;
  statusReason?: string;
  lastEvaluatedAt: string;
  lastEventTime?: string;
  objectsCreatedLastWindow?: number;
  bytesCreatedLastWindow?: number;
  objectsDeletedLastWindow?: number;
  bytesDeletedLastWindow?: number;
  totalObjects?: number;
  totalBytes?: number;
  ageHistogram?: AgeHistogram;
  storageClassBreakdown?: StorageClassBreakdown;
}

export interface PrefixSummary {
  config: PrefixConfig;
  status?: PrefixStatus;
}

export interface PrefixEvaluation extends PrefixStatus {
  evaluatedAt: string;
}

export interface Alert {
  alertId: string;
  bucketName: string;
  prefix: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  details?: Record<string, unknown>;
  createdAt: string;
  resolved: boolean;
}

export interface ExplorerObject {
  bucketName: string;
  key: string;
  sizeBytes: number;
  lastModified: string;
  storageClass: string;
  etag?: string;
  tags?: Record<string, string>;
}

export interface ExplorerQueryResponse extends PaginatedResponse<ExplorerObject> {
  summary?: {
    totalObjects?: number;
    totalBytes?: number;
  };
}

export interface GetBucketsResponse {
  buckets: BucketSummary[];
}

export interface GetBucketPrefixesResponse {
  bucket: BucketSummary;
  prefixes: PrefixSummary[];
}

export interface GetPrefixHealthResponse {
  bucket: BucketSummary;
  prefix: string;
  config: PrefixConfig;
  status?: PrefixStatus;
  evaluations?: PrefixEvaluation[];
  nextToken?: string;
}

export interface GetAlertsResponse extends PaginatedResponse<Alert> {}

export interface CreatePrefixRequest {
  prefix: string;
  freshnessExpectedIntervalMinutes: number;
  freshnessWarningThresholdMinutes: number;
  freshnessCriticalThresholdMinutes: number;
  stalenessAgeDays: number;
  stalenessMaxPctOld: number;
  partitionPattern?: string;
}

export interface GetPrefixEvaluationsResponse extends PaginatedResponse<PrefixEvaluation> {}

export interface CreateBucketRequest {
  bucketName: string;
  region: string;
  displayName?: string;
}

export type CreateBucketResponse = BucketSummary;
