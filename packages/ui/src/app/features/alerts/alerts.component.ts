import { Component } from '@angular/core';
import { BpButtonComponent, BpCardComponent, BpPillComponent, BpTableComponent } from '../../ui';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { Alert } from '../../services/api.types';
import { AsyncPipe, DatePipe, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { EncodeURIComponentPipe } from '../../pipes/encode-uri.pipe';
import { AlertsResolved } from './alerts.resolver';

@Component({
  selector: 'bp-alerts',
  standalone: true,
  imports: [
    BpButtonComponent,
    BpCardComponent,
    BpTableComponent,
    BpPillComponent,
    RouterLink,
    AsyncPipe,
    NgIf,
    NgFor,
    DatePipe,
    FormsModule,
    EncodeURIComponentPipe,
  ],
  styleUrls: ['./alerts.component.scss'],
  template: `
    <section class="section">
      <header class="section__header">
        <div>
          <p class="eyebrow">Monitoring</p>
          <h1>Alerts</h1>
          <p class="muted">Signals from freshness/staleness checks</p>
        </div>
        <div class="actions">
          <bp-button variant="secondary" (click)="reload()">Refresh</bp-button>
        </div>
      </header>
      <div class="alerts__filters">
        <div class="chip-row">
          <span class="chip-label">Severity:</span>
          <button
            class="chip"
            *ngFor="let sev of severityOptions"
            [class.chip--active]="severity === sev || (!severity && sev === 'ALL')"
            (click)="setSeverity(sev)"
          >
            {{ sev }}
          </button>
        </div>
        <div class="filter-row">
          <label>
            Type
            <select [(ngModel)]="type">
              <option value="">All</option>
              <option *ngFor="let t of typeOptions" [value]="t">{{ t }}</option>
            </select>
          </label>
          <label>
            Bucket/Prefix
            <input type="text" placeholder="bucket[/prefix]" [(ngModel)]="search" />
          </label>
          <label>
            Since
            <input type="date" [(ngModel)]="since" />
          </label>
          <label>
            Until
            <input type="date" [(ngModel)]="until" />
          </label>
          <div class="filter-actions">
            <bp-button variant="secondary" (click)="clearFilters()">Clear filters</bp-button>
            <bp-button variant="primary" (click)="reload()">Apply</bp-button>
          </div>
        </div>
      </div>
      <bp-card>
        <ng-container *ngIf="state$ | async as state">
          <div *ngIf="state.loading" class="muted">Loading alerts...</div>
          <div *ngIf="state.error && !state.loading" class="muted">
            {{ state.error }}
            <bp-button variant="secondary" (click)="reload()">Retry</bp-button>
          </div>
          <div *ngIf="!state.loading && !state.error && state.alerts.length === 0" class="muted">No alerts found.</div>
          <bp-table
            *ngIf="!state.loading && !state.error && state.alerts.length > 0"
            [headers]="['Severity', 'Type', 'Bucket/Prefix', 'Message', 'Created', 'Resolved']"
          >
            <tr *ngFor="let a of state.alerts">
              <td><bp-pill [variant]="toVariant(a.severity)">{{ a.severity }}</bp-pill></td>
              <td>{{ a.type }}</td>
              <td>
                <a [routerLink]="['/buckets', a.bucketName, 'prefixes', a.prefix | encodeURIComponent]">
                  {{ a.bucketName }}/{{ a.prefix }}
                </a>
              </td>
              <td>{{ a.message }}</td>
              <td>{{ a.createdAt | date: 'short' }}</td>
              <td>{{ a.resolved ? 'Yes' : 'No' }}</td>
            </tr>
          </bp-table>
          <div class="alerts__pagination" *ngIf="state.nextToken">
            <bp-button variant="secondary" (click)="loadMore()" [disabled]="loadingMore">Load more</bp-button>
          </div>
        </ng-container>
      </bp-card>
    </section>
  `,
})
export class AlertsComponent {
  state$ = new BehaviorSubject<{
    loading: boolean;
    alerts: Alert[];
    error: string | null;
    nextToken: string | null;
  }>({ loading: true, alerts: [], error: null, nextToken: null });
  severity: string | null = null;
  type: string = '';
  search = '';
  since = '';
  until = '';
  severityOptions: string[] = ['ALL', 'CRITICAL', 'WARN', 'INFO'];
  typeOptions: string[] = ['FRESHNESS', 'STALENESS', 'DELETE_SPIKE', 'GROWTH_SPIKE', 'OTHER'];
  loadingMore = false;

  constructor(private readonly api: ApiService) {}

  ngOnInit() {
    this.reload();
  }

  toVariant(sev: string) {
    if (sev === 'CRITICAL') return 'critical';
    if (sev === 'WARN') return 'warning';
    return 'neutral';
  }

  reload() {
    this.state$.next({ loading: true, alerts: [], error: null, nextToken: null });
    const { bucket, prefix } = this.splitSearch(this.search);
    this.api.getAlerts(this.buildFilters({ bucket, prefix })).subscribe({
      next: (resp) =>
        this.state$.next({ loading: false, alerts: resp.items, error: null, nextToken: resp.nextToken ?? null }),
      error: (err) =>
        this.state$.next({
          loading: false,
          alerts: [],
          error: err?.error?.message || 'Unable to load alerts',
          nextToken: null,
        }),
    });
  }

  clearFilters() {
    this.severity = null;
    this.type = '';
    this.search = '';
    this.since = '';
    this.until = '';
    this.reload();
  }

  setSeverity(sev: string) {
    this.severity = sev === 'ALL' ? null : sev;
    this.reload();
  }

  private splitSearch(input: string): { bucket: string | null; prefix: string | null } {
    const trimmed = input.trim();
    if (!trimmed) return { bucket: null, prefix: null };
    const [bucket, ...rest] = trimmed.split('/');
    const prefix = rest.length ? rest.join('/') : null;
    return { bucket, prefix };
  }

  private buildFilters(extra: { bucket: string | null; prefix: string | null; nextToken?: string } = { bucket: null, prefix: null }) {
    return {
      limit: 50,
      severity: this.severity && this.severity !== 'ALL' ? this.severity : undefined,
      type: this.type || undefined,
      bucketName: extra.bucket || undefined,
      prefix: extra.prefix || undefined,
      since: this.since || undefined,
      until: this.until || undefined,
      nextToken: extra.nextToken,
    } as any;
  }

  loadMore() {
    const token = this.state$.value.nextToken;
    if (!token || this.loadingMore) return;
    this.loadingMore = true;
    const { bucket, prefix } = this.splitSearch(this.search);
    this.api.getAlerts(this.buildFilters({ bucket, prefix, nextToken: token })).subscribe({
      next: (resp) => {
        this.state$.next({
          ...this.state$.value,
          alerts: [...this.state$.value.alerts, ...resp.items],
          nextToken: resp.nextToken ?? null,
        });
        this.loadingMore = false;
      },
      error: () => {
        this.loadingMore = false;
        this.state$.next({ ...this.state$.value, nextToken: null });
      },
    });
  }
}
