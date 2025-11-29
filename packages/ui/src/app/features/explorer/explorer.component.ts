import { Component } from '@angular/core';
import { BpCardComponent, BpTableComponent, BpButtonComponent, BpModalComponent } from '../../ui';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { ExplorerObject, ExplorerQueryResponse } from '../../services/api.types';
import { AsyncPipe, NgFor, NgIf, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { ExplorerResolved } from './explorer.resolver';
import { GetPrefixHealthResponse } from '../../services/api.types';

@Component({
  selector: 'bp-explorer',
  standalone: true,
  imports: [
    BpCardComponent,
    BpTableComponent,
    BpButtonComponent,
    BpModalComponent,
    RouterLink,
    AsyncPipe,
    NgIf,
    NgFor,
    DecimalPipe,
    DatePipe,
    FormsModule,
  ],
  styleUrls: ['./explorer.component.scss'],
  template: `
    <section class="section">
      <header class="section__header">
        <div>
          <p class="eyebrow">Explorer</p>
          <h1>Inventory Explorer</h1>
          <p class="muted">Browse objects with filters.</p>
        </div>
        <div class="actions">
          <bp-button variant="secondary" (click)="reload()">Refresh</bp-button>
        </div>
      </header>
      <div class="explorer__filters">
        <div class="filter-row">
          <label>
            Bucket
            <input type="text" placeholder="bucket-name" [(ngModel)]="bucketName" />
          </label>
          <label>
            Prefix
            <input type="text" placeholder="optional/prefix/" [(ngModel)]="prefix" />
          </label>
          <label>
            Min size (bytes)
            <input type="number" min="0" [(ngModel)]="minSize" />
          </label>
          <label>
            Max size (bytes)
            <input type="number" min="0" [(ngModel)]="maxSize" />
          </label>
          <label>
            Min age (days)
            <input type="number" min="0" [(ngModel)]="minAge" />
          </label>
          <label>
            Max age (days)
            <input type="number" min="0" [(ngModel)]="maxAge" />
          </label>
          <label>
            Storage class
            <select [(ngModel)]="storageClass">
              <option value="">All</option>
              <option *ngFor="let sc of storageClassOptions" [value]="sc">{{ sc }}</option>
            </select>
          </label>
          <label>
            Tag key
            <input type="text" [(ngModel)]="tagKey" />
          </label>
          <label>
            Tag value
            <input type="text" [(ngModel)]="tagValue" />
          </label>
        </div>
        <div class="filter-actions">
          <bp-button variant="secondary" (click)="clearFilters()">Clear</bp-button>
          <bp-button variant="primary" (click)="applyFilters()">Apply</bp-button>
        </div>
      </div>
      <div class="explorer__summary" *ngIf="state$ | async as state">
        <bp-card [dense]="true" [showHeaderDivider]="false">
          <div class="kpi-card">
            <div class="kpi-card__label">Objects</div>
            <div class="kpi-card__value">{{ state.summary?.totalObjects ?? state.items.length }}</div>
          </div>
        </bp-card>
        <bp-card [dense]="true" [showHeaderDivider]="false">
          <div class="kpi-card">
            <div class="kpi-card__label">Total bytes</div>
            <div class="kpi-card__value">{{ formatNumber(state.summary?.totalBytes) }}</div>
          </div>
        </bp-card>
      </div>
      <bp-card>
        <ng-container *ngIf="state$ | async as state">
          <div *ngIf="state.loading" class="muted">Loading objects...</div>
          <div *ngIf="state.error && !state.loading" class="muted">
            {{ state.error }}
            <bp-button variant="secondary" (click)="reload()">Retry</bp-button>
          </div>
          <div *ngIf="!state.loading && !state.error && state.items.length === 0" class="muted">
            No objects found.
          </div>
          <bp-table
            *ngIf="!state.loading && !state.error && state.items.length > 0"
            [headers]="['Key', 'Size', 'Last modified', 'Storage class']"
          >
            <tr *ngFor="let r of state.items">
              <td class="key-cell">
                <div class="key-cell__text">{{ r.key }}</div>
                <bp-button variant="secondary" size="sm" (click)="openDetails(r)">Details</bp-button>
              </td>
              <td>{{ r.sizeBytes | number }}</td>
              <td>{{ r.lastModified | date: 'short' }}</td>
              <td>{{ r.storageClass }}</td>
            </tr>
          </bp-table>
          <div class="explorer__pagination" *ngIf="state.nextToken">
            <bp-button variant="secondary" (click)="loadMore()" [disabled]="loadingMore">Load more</bp-button>
          </div>
        </ng-container>
      </bp-card>
      <bp-modal
        [open]="detailsOpen"
        title="Object details"
        subtitle="Inventory metadata"
        (close)="closeDetails()"
      >
        <ng-container *ngIf="selectedObject as obj">
          <p><strong>Bucket:</strong> {{ obj.bucketName }}</p>
          <p><strong>Key:</strong> {{ obj.key }}</p>
          <p><strong>Size:</strong> {{ obj.sizeBytes | number }} bytes</p>
          <p><strong>Last modified:</strong> {{ obj.lastModified | date: 'medium' }}</p>
          <p><strong>Storage class:</strong> {{ obj.storageClass }}</p>
          <p><strong>Age:</strong> {{ ageDays(obj.lastModified) }}</p>
          <div *ngIf="prefixFreshness">
            <p><strong>Prefix last event:</strong> {{ prefixFreshness.lastEventTime || '—' }}</p>
            <p><strong>Freshness:</strong> {{ prefixFreshness.status || 'Unknown' }}</p>
          </div>
          <div class="copy-row">
            <span>Copy:</span>
            <bp-button variant="secondary" size="sm" (click)="copyText(s3Uri(obj))">S3 URI</bp-button>
            <bp-button variant="secondary" size="sm" (click)="copyText(obj.key)">Key</bp-button>
            <bp-button variant="secondary" size="sm" [disabled]="!obj.etag" (click)="copyText(obj.etag || '')">
              ETag
            </bp-button>
          </div>
          <div *ngIf="obj.tags">
            <p><strong>Tags:</strong></p>
            <ul>
              <li *ngFor="let tag of tagEntries(obj.tags)">{{ tag.key }}: {{ tag.value }}</li>
            </ul>
          </div>
        </ng-container>
        <div modalFooter>
          <bp-button variant="secondary" (click)="closeDetails()">Close</bp-button>
        </div>
      </bp-modal>
    </section>
  `,
})
export class ExplorerComponent {
  state$ = new BehaviorSubject<{
    loading: boolean;
    items: ExplorerObject[];
    error: string | null;
    nextToken: string | null;
    summary?: ExplorerQueryResponse['summary'];
  }>({ loading: true, items: [], error: null, nextToken: null, summary: undefined });
  private defaultBucket = 'default';
  bucketName = '';
  prefix = '';
  minSize: number | null = null;
  maxSize: number | null = null;
  minAge: number | null = null;
  maxAge: number | null = null;
  storageClass = '';
  tagKey = '';
  tagValue = '';
  storageClassOptions = ['STANDARD', 'STANDARD_IA', 'ONEZONE_IA', 'GLACIER', 'DEEP_ARCHIVE', 'INTELLIGENT_TIERING'];
  loadingMore = false;
  detailsOpen = false;
  selectedObject: ExplorerObject | null = null;
  prefixFreshness: { lastEventTime?: string; warn?: number; crit?: number; status?: string } | null = null;

  constructor(private readonly api: ApiService, private readonly route: ActivatedRoute) {}

  ngOnInit() {
    this.reloadFromResolver();
  }

  private reloadFromResolver() {
    const data = this.route.snapshot.data['explorerData'] as ExplorerResolved | undefined;
    if (data) {
      this.state$.next({
        loading: false,
        items: data.items,
        error: data.error ?? null,
        nextToken: data.nextToken ?? null,
        summary: (data as any).summary,
      });
    } else {
      this.reload();
    }
  }

  reload() {
    this.state$.next({ loading: true, items: [], error: null, nextToken: null });
    this.api.explorerQuery(this.buildParams()).subscribe({
      next: (resp) =>
        this.state$.next({
          loading: false,
          items: resp.items,
          error: null,
          nextToken: resp.nextToken ?? null,
          summary: resp.summary,
        }),
      error: (err) =>
        this.state$.next({
          loading: false,
          items: [],
          error: err?.error?.message || 'Unable to load explorer data',
          nextToken: null,
          summary: undefined,
        }),
    });
  }

  applyFilters() {
    this.reload();
  }

  clearFilters() {
    this.bucketName = '';
    this.prefix = '';
    this.minSize = null;
    this.maxSize = null;
    this.minAge = null;
    this.maxAge = null;
    this.storageClass = '';
    this.tagKey = '';
    this.tagValue = '';
    this.reload();
  }

  loadMore() {
    const token = this.state$.value.nextToken;
    if (!token || this.loadingMore) return;
    this.loadingMore = true;
    this.api.explorerQuery(this.buildParams(token)).subscribe({
      next: (resp) => {
        this.state$.next({
          ...this.state$.value,
          items: [...this.state$.value.items, ...resp.items],
          nextToken: resp.nextToken ?? null,
          summary: resp.summary ?? this.state$.value.summary,
        });
        this.loadingMore = false;
      },
      error: () => {
        this.loadingMore = false;
        this.state$.next({ ...this.state$.value, nextToken: null });
      },
    });
  }

  private buildParams(nextToken?: string) {
    return {
      bucketName: this.bucketName.trim() || this.defaultBucket,
      prefix: this.prefix.trim() || undefined,
      minSizeBytes: this.minSize ?? undefined,
      maxSizeBytes: this.maxSize ?? undefined,
      minAgeDays: this.minAge ?? undefined,
      maxAgeDays: this.maxAge ?? undefined,
      storageClass: this.storageClass || undefined,
      tagKey: this.tagKey.trim() || undefined,
      tagValue: this.tagValue.trim() || undefined,
      limit: 50,
      nextToken,
    };
  }

  openDetails(obj: ExplorerObject) {
    this.selectedObject = obj;
    this.detailsOpen = true;
    this.prefixFreshness = null;
    // If a prefix filter is set, pull the latest prefix health to show last event freshness
    if (this.prefix) {
      this.api.getPrefixHealth(obj.bucketName, this.prefix).subscribe({
        next: (resp) => {
          const lastEvent = resp.status?.lastEventTime;
          const warn = resp.config.freshnessWarningThresholdMinutes;
          const crit = resp.config.freshnessCriticalThresholdMinutes;
          this.prefixFreshness = {
            lastEventTime: lastEvent,
            warn,
            crit,
            status: this.evaluateFreshness(lastEvent, warn, crit),
          };
        },
        error: () => {
          this.prefixFreshness = null;
        },
      });
    }
  }

  closeDetails() {
    this.detailsOpen = false;
    this.selectedObject = null;
  }

  tagEntries(tags?: Record<string, string>) {
    if (!tags) return [];
    return Object.entries(tags).map(([key, value]) => ({ key, value }));
  }

  s3Uri(obj: ExplorerObject) {
    return `s3://${obj.bucketName}/${obj.key}`;
  }

  ageDays(lastModified?: string) {
    if (!lastModified) return '—';
    const ms = Date.now() - new Date(lastModified).getTime();
    const days = ms / (1000 * 60 * 60 * 24);
    return `${days.toFixed(1)} days`;
  }

  async copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  }

  private evaluateFreshness(lastEvent?: string, warn?: number, crit?: number): string {
    if (!lastEvent || warn == null || crit == null) return 'Unknown';
    const diffMinutes = (Date.now() - new Date(lastEvent).getTime()) / 60000;
    if (diffMinutes > crit) return `Over critical (${Math.round(diffMinutes)}m)`;
    if (diffMinutes > warn) return `Warning (${Math.round(diffMinutes)}m)`;
    return `Healthy (${Math.round(diffMinutes)}m)`;
  }

  formatNumber(val?: number | null) {
    if (val === null || val === undefined) return '—';
    return val.toLocaleString();
  }
}
