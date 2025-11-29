import { Component } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AsyncPipe, NgFor, NgIf, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { BpButtonComponent, BpCardComponent, BpPillComponent, BpTableComponent, BpModalComponent, BpToastService } from '../../ui';
import { ApiService } from '../../services/api.service';
import { Alert, GetBucketPrefixesResponse } from '../../services/api.types';
import { EncodeURIComponentPipe } from '../../pipes/encode-uri.pipe';
import { BucketDetailResolved } from './bucket-detail.resolver';

@Component({
  selector: 'bp-bucket-detail',
  standalone: true,
  imports: [
    RouterLink,
    AsyncPipe,
    NgIf,
    NgFor,
    BpButtonComponent,
    BpCardComponent,
    BpPillComponent,
    BpTableComponent,
    BpModalComponent,
    EncodeURIComponentPipe,
    DecimalPipe,
    DatePipe,
    FormsModule,
  ],
  styleUrls: ['./bucket-detail.component.scss'],
  template: `
    <section class="section" *ngIf="state$ | async as state">
      <div *ngIf="state.loading" class="muted">Loading bucket...</div>

      <bp-card *ngIf="state.error && !state.loading" title="Unable to load bucket">
        <p class="muted">{{ state.error }}</p>
        <bp-button variant="secondary" (click)="reload()">Retry</bp-button>
      </bp-card>

      <ng-container *ngIf="!state.loading && !state.error && state.data as data">
        <header class="section__header">
          <div>
            <p class="eyebrow">
              <a routerLink="/buckets">Buckets</a>
              <span class="chevron">/</span>
              {{ data.bucket.bucketName }}
            </p>
            <h1>
              {{ data.bucket.bucketName }}
              <bp-pill class="pill-inline" [variant]="pillVariant(data.bucket.status)">{{
                data.bucket.status || 'UNKNOWN'
              }}</bp-pill>
            </h1>
            <p class="muted">
              {{ data.bucket.region }}
            </p>
          </div>
          <div class="actions">
            <bp-button variant="secondary" (click)="reload()">Refresh</bp-button>
            <bp-button variant="secondary">Configure bucket</bp-button>
            <bp-button variant="primary">+ Add tracked prefix</bp-button>
          </div>
        </header>
        <div class="bucket-kpis">
          <bp-card [dense]="true" [showHeaderDivider]="false">
            <div class="kpi-card">
              <div class="kpi-card__label">Tracked prefixes</div>
              <div class="kpi-card__value">{{ data.bucket.trackedPrefixesCount ?? '—' }}</div>
            </div>
          </bp-card>
          <bp-card [dense]="true" [showHeaderDivider]="false">
            <div class="kpi-card">
              <div class="kpi-card__label">Total objects</div>
              <div class="kpi-card__value">
                {{ data.bucket.totalObjects ?? '—' | number: '1.0-0' }}
              </div>
            </div>
          </bp-card>
          <bp-card [dense]="true" [showHeaderDivider]="false">
            <div class="kpi-card">
              <div class="kpi-card__label">Total bytes</div>
              <div class="kpi-card__value">{{ formatBytes(data.bucket.totalBytes) }}</div>
            </div>
          </bp-card>
          <bp-card [dense]="true" [showHeaderDivider]="false">
            <div class="kpi-card">
              <div class="kpi-card__label">Last evaluated</div>
              <div class="kpi-card__value">
                {{ data.bucket.lastEvaluatedAt ? (data.bucket.lastEvaluatedAt | date: 'short') : '—' }}
              </div>
            </div>
          </bp-card>
        </div>
        <div class="bucket-panels">
          <bp-card title="Recent alerts" subtitle="Latest signals for this bucket">
            <div *ngIf="alerts$ | async as alertState">
              <div *ngIf="alertState.loading" class="muted">Loading alerts...</div>
              <div *ngIf="alertState.error" class="muted">Unable to load alerts: {{ alertState.error }}</div>
              <div *ngIf="!alertState.loading && !alertState.error && alertState.items.length === 0" class="muted">
                No alerts for this bucket.
              </div>
              <bp-table *ngIf="alertState.items.length > 0" [headers]="['Severity', 'Type', 'Prefix', 'Message']">
                <tr *ngFor="let a of alertState.items">
                  <td><bp-pill [variant]="toAlertVariant(a.severity)">{{ a.severity }}</bp-pill></td>
                  <td>{{ a.type }}</td>
                  <td>
                    <a [routerLink]="['/buckets', a.bucketName, 'prefixes', (a.prefix | encodeURIComponent)]">
                      {{ a.prefix }}
                    </a>
                  </td>
                  <td>{{ a.message }}</td>
                </tr>
              </bp-table>
            </div>
          </bp-card>
          <bp-card title="Evaluation history" subtitle="Coming soon">
            <p class="muted">Timeline of evaluations will appear here.</p>
          </bp-card>
        </div>
        <bp-card [title]="data.bucket.bucketName" subtitle="Tracked prefixes">
          <div class="prefix-filters">
            <input
              type="text"
              placeholder="Search prefixes..."
              [(ngModel)]="prefixSearch"
              (ngModelChange)="onFilterChange()"
            />
          </div>
          <ng-container *ngIf="data.prefixes.length === 0">
            <div class="prefix-empty">
              <p class="muted">No prefixes are being tracked for this bucket yet.</p>
              <bp-button variant="primary" (click)="openPrefixModal()">+ Add tracked prefix</bp-button>
            </div>
          </ng-container>
          <ng-container *ngIf="data.prefixes.length > 0">
            <div *ngIf="filteredPrefixes.length === 0" class="muted">No prefixes match your search.</div>
            <bp-table
              *ngIf="filteredPrefixes.length > 0"
              [headers]="[
                'Prefix',
                'Status',
                'Freshness threshold',
                'Staleness threshold',
                'Last evaluated',
                'Objects'
              ]"
            >
              <tr *ngFor="let p of filteredPrefixes">
                <td>
                  <a
                    [routerLink]="['/buckets', data.bucket.bucketName, 'prefixes', (p.config.prefix | encodeURIComponent)]"
                  >
                    {{ p.config.prefix }}
                  </a>
                </td>
                <td>
                  <bp-pill [variant]="pillVariant(p.status?.status)">{{ p.status?.status || 'UNKNOWN' }}</bp-pill>
                </td>
                <td>
                  {{ p.config.freshnessWarningThresholdMinutes }}m warn /
                  {{ p.config.freshnessCriticalThresholdMinutes }}m crit
                </td>
                <td>{{ p.config.stalenessAgeDays }}d / {{ p.config.stalenessMaxPctOld }}% old</td>
                <td>{{ p.status?.lastEvaluatedAt ? (p.status?.lastEvaluatedAt | date: 'short') : '—' }}</td>
                <td>{{ p.status?.totalObjects ?? '—' }}</td>
              </tr>
            </bp-table>
          </ng-container>
        </bp-card>
      </ng-container>
      <bp-modal
        [open]="prefixModalOpen"
        title="Add tracked prefix"
        subtitle="Define thresholds for this prefix"
        (close)="closePrefixModal()"
      >
        <form class="prefix-form" #prefixForm="ngForm" (ngSubmit)="onSubmitPrefix(prefixForm)">
          <label>
            Prefix
            <input
              type="text"
              name="prefix"
              required
              [(ngModel)]="prefixValue"
              #prefixCtrl="ngModel"
              placeholder="e.g. logs/2024/"
            />
            <p class="form-hint" *ngIf="prefixCtrl.invalid && prefixCtrl.touched">Prefix is required.</p>
          </label>
          <div class="form-grid">
            <label>
              Expected interval (min)
              <input
                type="number"
                name="freshnessExpected"
                required
                min="1"
                [(ngModel)]="freshnessExpected"
                #expCtrl="ngModel"
              />
              <p class="form-hint" *ngIf="expCtrl.invalid && expCtrl.touched">Enter minutes &gt; 0.</p>
            </label>
            <label>
              Warning at (min)
              <input
                type="number"
                name="freshnessWarn"
                required
                min="1"
                [(ngModel)]="freshnessWarn"
                #warnCtrl="ngModel"
              />
            </label>
            <label>
              Critical at (min)
              <input
                type="number"
                name="freshnessCrit"
                required
                min="1"
                [(ngModel)]="freshnessCrit"
                #critCtrl="ngModel"
              />
            </label>
          </div>
          <div class="form-grid">
            <label>
              Stale after (days)
              <input
                type="number"
                name="stalenessAgeDays"
                required
                min="1"
                [(ngModel)]="stalenessAgeDays"
                #staleAgeCtrl="ngModel"
              />
            </label>
            <label>
              Max % old objects
              <input
                type="number"
                name="stalenessMaxPctOld"
                required
                min="0"
                max="100"
                [(ngModel)]="stalenessMaxPctOld"
                #stalePctCtrl="ngModel"
              />
              <p class="form-hint" *ngIf="stalePctCtrl.invalid && stalePctCtrl.touched">Between 0 and 100.</p>
            </label>
          </div>
          <label>
            Partition pattern (optional)
            <input
              type="text"
              name="partitionPattern"
              [(ngModel)]="partitionPattern"
              placeholder="e.g. yyyy/MM/dd/"
            />
          </label>
          <label>
            Notes (optional)
            <textarea name="notes" rows="2" [(ngModel)]="notes" placeholder="Anything useful for this prefix"></textarea>
          </label>
          <p class="form-error" *ngIf="prefixFormError">{{ prefixFormError }}</p>
        </form>
        <div modalFooter>
          <bp-button variant="secondary" (click)="closePrefixModal()">Cancel</bp-button>
          <bp-button
            variant="primary"
            type="submit"
            [disabled]="prefixSubmitting || !!prefixForm?.invalid"
            (click)="onSubmitPrefix(prefixForm)"
          >
            {{ prefixSubmitting ? 'Saving...' : 'Save prefix' }}
          </bp-button>
        </div>
      </bp-modal>
    </section>
  `,
})
export class BucketDetailComponent {
  state$ = new BehaviorSubject<{
    loading: boolean;
    data: GetBucketPrefixesResponse | null;
    error: string | null;
  }>({ loading: true, data: null, error: null });
  private bucketName: string;
  alerts$ = new BehaviorSubject<{ loading: boolean; items: Alert[]; error: string | null }>({
    loading: true,
    items: [],
    error: null,
  });
  prefixSearch = '';
  filteredPrefixes: GetBucketPrefixesResponse['prefixes'] = [];
  prefixModalOpen = false;
  prefixSubmitting = false;
  prefixFormError: string | null = null;
  prefixValue = '';
  freshnessExpected = 60;
  freshnessWarn = 90;
  freshnessCrit = 120;
  stalenessAgeDays = 30;
  stalenessMaxPctOld = 10;
  partitionPattern = '';
  notes = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly api: ApiService,
    private readonly toast: BpToastService,
  ) {
    this.bucketName = this.route.snapshot.paramMap.get('bucketName') ?? '';
    this.route.data.subscribe(({ bucketData }) => {
      const resolved = bucketData as BucketDetailResolved | undefined;
      this.state$.next({
        loading: false,
        data: resolved?.data ?? null,
        error: resolved?.error ?? null,
      });
      if (resolved?.data?.prefixes) {
        this.filteredPrefixes = resolved.data.prefixes;
      }
      this.applyFilter();
    });
    this.loadAlerts();
  }

  pillVariant(status?: string) {
    if (!status) return 'unknown';
    const normalized = status.toUpperCase();
    if (normalized === 'OK') return 'ok';
    if (normalized === 'DEGRADING') return 'warning';
    if (normalized === 'STALLED' || normalized === 'ANOMALOUS') return 'critical';
    return 'unknown';
  }

  reload() {
    this.state$.next({ loading: true, data: null, error: null });
    this.api.getBucketPrefixes(this.bucketName).subscribe({
      next: (data) => {
        this.state$.next({ loading: false, data, error: null });
        this.filteredPrefixes = data.prefixes;
        this.applyFilter();
      },
      error: (err) =>
        this.state$.next({
          loading: false,
          data: null,
          error: err?.error?.message || 'Unable to load bucket details',
        }),
    });
    this.loadAlerts();
  }

  formatBytes(bytes?: number | null): string {
    if (bytes == null) return '—';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
    let val = bytes / 1024;
    let idx = 0;
    while (val >= 1024 && idx < units.length - 1) {
      val /= 1024;
      idx++;
    }
    return `${val.toFixed(1)} ${units[idx]}`;
  }

  onFilterChange() {
    this.applyFilter();
  }

  private applyFilter() {
    const term = this.prefixSearch.trim().toLowerCase();
    const prefixes = this.state$.value.data?.prefixes ?? [];
    this.filteredPrefixes = prefixes.filter((p) => {
      if (!term) return true;
      return p.config.prefix.toLowerCase().includes(term);
    });
  }

  private loadAlerts() {
    this.alerts$.next({ loading: true, items: [], error: null });
    this.api.getAlerts({ bucketName: this.bucketName, limit: 10 }).subscribe({
      next: (resp) => this.alerts$.next({ loading: false, items: resp.items, error: null }),
      error: (err) =>
        this.alerts$.next({
          loading: false,
          items: [],
          error: err?.error?.message || 'Unable to load alerts',
        }),
    });
  }

  toAlertVariant(sev?: string) {
    if (!sev) return 'neutral';
    const s = sev.toUpperCase();
    if (s === 'CRITICAL') return 'critical';
    if (s === 'WARN') return 'warning';
    return 'neutral';
  }

  openPrefixModal() {
    this.resetPrefixForm();
    this.prefixModalOpen = true;
  }

  closePrefixModal() {
    this.prefixModalOpen = false;
  }

  onSubmitPrefix(form: any) {
    if (this.prefixSubmitting) return;
    form?.form.markAllAsTouched();
    this.prefixFormError = null;
    if (form?.invalid) {
      return;
    }
    if (!(this.freshnessExpected <= this.freshnessWarn && this.freshnessWarn <= this.freshnessCrit)) {
      this.prefixFormError = 'Expected <= warning <= critical thresholds.';
      return;
    }
    if (this.stalenessMaxPctOld < 0 || this.stalenessMaxPctOld > 100) {
      this.prefixFormError = 'Max % old must be between 0 and 100.';
      return;
    }
    this.prefixSubmitting = true;
    this.api
      .createPrefix(this.bucketName, {
        prefix: this.prefixValue.trim(),
        freshnessExpectedIntervalMinutes: this.freshnessExpected,
        freshnessWarningThresholdMinutes: this.freshnessWarn,
        freshnessCriticalThresholdMinutes: this.freshnessCrit,
        stalenessAgeDays: this.stalenessAgeDays,
        stalenessMaxPctOld: this.stalenessMaxPctOld,
        partitionPattern: this.partitionPattern?.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.prefixSubmitting = false;
          this.toast.show('Prefix saved.', 'success');
          this.closePrefixModal();
          this.reload();
        },
        error: (err) => {
          this.prefixSubmitting = false;
          const msg = err?.error?.message || 'Unable to save prefix.';
          this.prefixFormError = msg;
          this.toast.show(msg, 'error', 5000);
        },
      });
  }

  private resetPrefixForm() {
    this.prefixFormError = null;
    this.prefixValue = '';
    this.freshnessExpected = 60;
    this.freshnessWarn = 90;
    this.freshnessCrit = 120;
    this.stalenessAgeDays = 30;
    this.stalenessMaxPctOld = 10;
    this.partitionPattern = '';
    this.notes = '';
    this.prefixSubmitting = false;
  }
}
