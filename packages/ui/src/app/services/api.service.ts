import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  Alert,
  CreateBucketRequest,
  CreateBucketResponse,
  CreatePrefixRequest,
  ExplorerQueryResponse,
  GetAlertsResponse,
  GetBucketPrefixesResponse,
  GetBucketsResponse,
  GetPrefixEvaluationsResponse,
  GetPrefixHealthResponse,
} from './api.types';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { ConfigService } from '../config/config.service';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly baseUrl: string;

  constructor(private readonly http: HttpClient, config: ConfigService) {
    this.baseUrl = config.baseApiUrl;
  }

  getBuckets(): Observable<GetBucketsResponse> {
    return this.http.get<GetBucketsResponse>(`${this.baseUrl}/buckets`);
  }

  createBucket(payload: CreateBucketRequest): Observable<CreateBucketResponse> {
    return this.http.post<CreateBucketResponse>(`${this.baseUrl}/buckets`, payload);
  }

  getBucketPrefixes(bucketName: string): Observable<GetBucketPrefixesResponse> {
    return this.http.get<GetBucketPrefixesResponse>(`${this.baseUrl}/buckets/${encodeURIComponent(bucketName)}/prefixes`);
  }

  createPrefix(bucketName: string, payload: CreatePrefixRequest) {
    return this.http.post(`${this.baseUrl}/buckets/${encodeURIComponent(bucketName)}/prefixes`, payload);
  }

  getPrefixHealth(bucketName: string, prefix: string): Observable<GetPrefixHealthResponse> {
    return this.http.get<GetPrefixHealthResponse>(
      `${this.baseUrl}/buckets/${encodeURIComponent(bucketName)}/prefixes/${encodeURIComponent(prefix)}/health`,
    );
  }

  getPrefixEvaluations(
    bucketName: string,
    prefix: string,
    options: { limit?: number; nextToken?: string } = {},
  ): Observable<GetPrefixEvaluationsResponse> {
    let params = new HttpParams();
    if (options.limit != null) params = params.set('limit', options.limit);
    if (options.nextToken) params = params.set('nextToken', options.nextToken);
    return this.http.get<GetPrefixEvaluationsResponse>(
      `${this.baseUrl}/buckets/${encodeURIComponent(bucketName)}/prefixes/${encodeURIComponent(prefix)}/evaluations`,
      { params },
    );
  }

  getAlerts(params: {
    bucketName?: string;
    prefix?: string;
    severity?: string;
    type?: string;
    since?: string;
    until?: string;
    limit?: number;
    nextToken?: string;
  }): Observable<GetAlertsResponse> {
    let httpParams = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        httpParams = httpParams.set(k, String(v));
      }
    });
    return this.http.get<GetAlertsResponse>(`${this.baseUrl}/alerts`, { params: httpParams });
  }

  explorerQuery(params: {
    bucketName: string;
    prefix?: string;
    minSizeBytes?: number;
    maxSizeBytes?: number;
    minAgeDays?: number;
    maxAgeDays?: number;
    storageClass?: string;
    tagKey?: string;
    tagValue?: string;
    limit?: number;
    nextToken?: string;
  }): Observable<ExplorerQueryResponse> {
    let httpParams = new HttpParams().set('bucketName', params.bucketName);
    (['prefix', 'storageClass', 'tagKey', 'tagValue', 'nextToken'] as const).forEach((key) => {
      const v = params[key];
      if (v) httpParams = httpParams.set(key, v);
    });
    (['minSizeBytes', 'maxSizeBytes', 'minAgeDays', 'maxAgeDays', 'limit'] as const).forEach((key) => {
      const v = params[key];
      if (typeof v === 'number') httpParams = httpParams.set(key, v);
    });
    return this.http.get<ExplorerQueryResponse>(`${this.baseUrl}/explorer/query`, { params: httpParams });
  }
}
