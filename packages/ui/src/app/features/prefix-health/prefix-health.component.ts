import { Component } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AsyncPipe, DatePipe, DecimalPipe, NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BpButtonComponent, BpCardComponent, BpPillComponent, BpModalComponent, BpToastService } from '../../ui';
import { Alert, GetPrefixHealthResponse, PrefixEvaluation } from '../../services/api.types';
import { BehaviorSubject, forkJoin } from 'rxjs';
import { PrefixHealthResolved } from './prefix-health.resolver';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'bp-prefix-health',
  standalone: true,
  imports: [
    RouterLink,
    AsyncPipe,
    DatePipe,
    DecimalPipe,
    NgIf,
    NgFor,
    FormsModule,
    BpCardComponent,
    BpPillComponent,
    BpButtonComponent,
    BpModalComponent,
  ],
  styleUrls: ['./prefix-health.component.scss'],
  template: `
    <section class="section" *ngIf="state$ | async as state">
      <div *ngIf="state.loading" class="muted">Loading prefix...</div>

      <bp-card *ngIf="state.error && !state.loading" title="Unable to load prefix">
        <p class="muted">{{ state.error }}</p>
        <bp-button variant="secondary" (click)="reload()">Retry</bp-button>
      </bp-card>

      <ng-container *ngIf="!state.loading && !state.error && state.health as data">
        <header class="section__header">
          <div>
            <p class="eyebrow">
              <a routerLink="/buckets">Buckets</a>
              <span class="chevron">/</span>
              <a [routerLink]="['/buckets', data.bucket.bucketName]">{{ data.bucket.bucketName }}</a>
              <span class="chevron">/</span>
              {{ data.prefix }}
            </p>
            <h1>Prefix health</h1>
            <p class="muted">Status and metrics for a tracked prefix.</p>
          </div>
          <div class="actions">
            <bp-button variant="secondary" (click)="reload()">Refresh</bp-button>
            <bp-button variant="primary" (click)="openEditModal()">Edit prefix</bp-button>
          </div>
        </header>
        <div class="prefix-kpis">
          <bp-card [dense]="true" [showHeaderDivider]="false">
            <div class="kpi-card">
              <div class="kpi-card__label">Status</div>
              <div class="kpi-card__value">
                <bp-pill [variant]="pillVariant(data.status?.status)">{{ data.status?.status || 'UNKNOWN' }}</bp-pill>
              </div>
              <div class="kpi-card__hint" *ngIf="data.status?.statusReason">{{ data.status?.statusReason }}</div>
            </div>
          </bp-card>
          <bp-card [dense]="true" [showHeaderDivider]="false">
            <div class="kpi-card">
              <div class="kpi-card__label">Last evaluated</div>
              <div class="kpi-card__value">
                {{ data.status?.lastEvaluatedAt ? (data.status?.lastEvaluatedAt | date: 'short') : '—' }}
              </div>
            </div>
          </bp-card>
          <bp-card [dense]="true" [showHeaderDivider]="false">
            <div class="kpi-card">
              <div class="kpi-card__label">Objects</div>
              <div class="kpi-card__value">{{ data.status?.totalObjects ?? '—' }}</div>
            </div>
          </bp-card>
          <bp-card [dense]="true" [showHeaderDivider]="false">
            <div class="kpi-card">
              <div class="kpi-card__label">Bytes</div>
              <div class="kpi-card__value">{{ formatBytes(data.status?.totalBytes) }}</div>
            </div>
          </bp-card>
        </div>
        <div class="prefix-highlights">
          <bp-card title="Freshness thresholds" [dense]="true">
            <p class="muted">
              Expected every {{ data.config.freshnessExpectedIntervalMinutes }} min &middot; Warning at
              {{ data.config.freshnessWarningThresholdMinutes }} min &middot; Critical at
              {{ data.config.freshnessCriticalThresholdMinutes }} min
            </p>
          </bp-card>
          <bp-card title="Staleness thresholds" [dense]="true">
            <p class="muted">
              Stale after {{ data.config.stalenessAgeDays }} days or {{ data.config.stalenessMaxPctOld }}% old objects
            </p>
          </bp-card>
        </div>
        <div class="prefix-charts">
          <bp-card title="Age distribution">
            <ng-container *ngIf="data.status?.ageHistogram as hist; else noAge">
              <div class="chart-bars">
                <div class="bar" *ngFor="let bucket of ageBuckets">
                  <div class="bar__label">{{ bucket.label }}</div>
                  <div class="bar__track">
                    <div class="bar__fill" [style.width.%]="agePercent(hist[bucket.key])"></div>
                  </div>
                  <div class="bar__value">{{ hist[bucket.key] || 0 | number }}</div>
                </div>
              </div>
            </ng-container>
            <ng-template #noAge>
              <p class="muted">Age histogram not available yet.</p>
            </ng-template>
          </bp-card>
          <bp-card title="Storage classes">
            <ng-container *ngIf="storageEntries(data.status?.storageClassBreakdown)?.length as entries; else noStorage">
              <div class="chart-bars">
                <div class="bar" *ngFor="let sc of storageEntries(data.status?.storageClassBreakdown)">
                  <div class="bar__label">{{ sc[0] }}</div>
                  <div class="bar__track">
                    <div class="bar__fill" [style.width.%]="storagePercent(sc[1], data.status?.totalObjects)"></div>
                  </div>
                  <div class="bar__value">{{ sc[1] | number }}</div>
                </div>
              </div>
            </ng-container>
            <ng-template #noStorage>
              <p class="muted">Storage class breakdown not available yet.</p>
            </ng-template>
          </bp-card>
        </div>
        <bp-card title="Recent alerts" subtitle="Latest signals for this prefix">
          <div *ngIf="state.alerts.length === 0" class="muted">No alerts for this prefix.</div>
          <ul class="alert-list" *ngIf="state.alerts.length > 0">
            <li *ngFor="let a of state.alerts">
              <bp-pill [variant]="pillVariantFromSeverity(a.severity)">{{ a.severity }}</bp-pill>
              <span class="alert-list__time">{{ a.createdAt | date: 'short' }}</span>
              <span class="alert-list__message">{{ a.message }}</span>
            </li>
          </ul>
        </bp-card>
        <bp-card title="Evaluation history" subtitle="Recent evaluations">
          <div *ngIf="state.health == null" class="muted">Loading evaluations...</div>
          <div *ngIf="state.health && state.evaluations.length === 0" class="muted">No evaluations yet.</div>
          <table class="eval-table" *ngIf="state.evaluations.length > 0">
            <thead>
              <tr>
                <th>Evaluated</th>
                <th>Status</th>
                <th>Reason</th>
                <th>Objects</th>
                <th>Bytes</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let ev of state.evaluations">
                <td>{{ ev.evaluatedAt | date: 'short' }}</td>
                <td><bp-pill [variant]="pillVariant(ev.status)">{{ ev.status }}</bp-pill></td>
                <td>{{ ev.statusReason || '—' }}</td>
                <td>{{ ev.totalObjects ?? '—' }}</td>
                <td>{{ formatBytes(ev.totalBytes) }}</td>
              </tr>
            </tbody>
          </table>
          <div class="eval-actions" *ngIf="state.nextToken">
            <bp-button variant="secondary" (click)="loadMore()">Load more</bp-button>
          </div>
        </bp-card>
        <bp-modal
          [open]="editModalOpen"
          title="Edit prefix thresholds"
          subtitle="Update freshness and staleness settings"
          (close)="closeEditModal()"
        >
          <form class="edit-form" #editForm="ngForm" (ngSubmit)="submitEdit(editForm)">
            <label>
              Prefix
              <input type="text" name="prefix" [value]="state.health ? state.health.prefix : ''" disabled />
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
              <input type="text" name="partitionPattern" [(ngModel)]="partitionPattern" />
            </label>
            <p class="form-error" *ngIf="editError">{{ editError }}</p>
          </form>
          <div modalFooter>
            <bp-button variant="secondary" (click)="closeEditModal()">Cancel</bp-button>
            <bp-button
              variant="primary"
              type="submit"
              [disabled]="editSubmitting || !!editForm?.invalid"
              (click)="submitEdit(editForm)"
            >
              {{ editSubmitting ? 'Saving...' : 'Save' }}
            </bp-button>
          </div>
        </bp-modal>
      </ng-container>
    </section>
  `,
})
export class PrefixHealthComponent {
  state$ = new BehaviorSubject<{
    loading: boolean;
    health: GetPrefixHealthResponse | null;
    alerts: Alert[];
    evaluations: PrefixEvaluation[];
    error: string | null;
    nextToken?: string | null;
  }>({ loading: true, health: null, alerts: [], evaluations: [], error: null, nextToken: null });
  private bucketName: string;
  private prefix: string;
  editModalOpen = false;
  editSubmitting = false;
  editError: string | null = null;
  freshnessExpected = 60;
  freshnessWarn = 90;
  freshnessCrit = 120;
  stalenessAgeDays = 30;
  stalenessMaxPctOld = 10;
  partitionPattern = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly api: ApiService,
    private readonly toast: BpToastService,
  ) {
    this.bucketName = this.route.snapshot.paramMap.get('bucketName') ?? '';
    this.prefix = decodeURIComponent(this.route.snapshot.paramMap.get('prefix') ?? '');
    this.route.data.subscribe(({ prefixData }) => {
      const resolved = prefixData as PrefixHealthResolved | undefined;
      this.state$.next({
        loading: false,
        health: resolved?.health ?? null,
        alerts: resolved?.alerts ?? [],
        evaluations: resolved?.evaluations ?? [],
        nextToken: resolved?.nextToken ?? null,
        error: resolved?.error ?? null,
      });
    });
  }

  pillVariant(status?: string) {
    if (!status) return 'unknown';
    const s = status.toUpperCase();
    if (s === 'OK') return 'ok';
    if (s === 'DEGRADING') return 'warning';
    if (s === 'STALLED' || s === 'ANOMALOUS') return 'critical';
    return 'unknown';
  }

  reload() {
    this.state$.next({ loading: true, health: null, alerts: [], evaluations: [], nextToken: null, error: null });
    forkJoin([
      this.api.getPrefixHealth(this.bucketName, this.prefix),
      this.api.getAlerts({ bucketName: this.bucketName, prefix: this.prefix, limit: 20 }),
      this.api.getPrefixEvaluations(this.bucketName, this.prefix, { limit: 20 }),
    ]).subscribe({
      next: ([health, alerts, evals]) =>
        this.state$.next({
          loading: false,
          health,
          alerts: alerts.items,
          evaluations: evals.items,
          nextToken: evals.nextToken ?? null,
          error: null,
        }),
      error: (err) =>
        this.state$.next({
          loading: false,
          health: null,
          alerts: [],
          evaluations: [],
          nextToken: null,
          error: err?.error?.message || 'Unable to load prefix health',
        }),
    });
  }

  loadMore() {
    const token = this.state$.value.nextToken;
    if (!token) return;
    this.api
      .getPrefixEvaluations(this.bucketName, this.prefix, { nextToken: token, limit: 20 })
      .subscribe({
        next: (resp) =>
          this.state$.next({
            ...this.state$.value,
            evaluations: [...this.state$.value.evaluations, ...resp.items],
            nextToken: resp.nextToken ?? null,
          }),
        error: () =>
          this.state$.next({
            ...this.state$.value,
            nextToken: null,
          }),
      });
  }

  openEditModal() {
    const cfg = this.state$.value.health?.config;
    if (cfg) {
      this.freshnessExpected = cfg.freshnessExpectedIntervalMinutes;
      this.freshnessWarn = cfg.freshnessWarningThresholdMinutes;
      this.freshnessCrit = cfg.freshnessCriticalThresholdMinutes;
      this.stalenessAgeDays = cfg.stalenessAgeDays;
      this.stalenessMaxPctOld = cfg.stalenessMaxPctOld;
      this.partitionPattern = cfg.partitionPattern ?? '';
    }
    this.editError = null;
    this.editModalOpen = true;
  }

  closeEditModal() {
    this.editModalOpen = false;
    this.editSubmitting = false;
    this.editError = null;
  }

  submitEdit(form: any) {
    if (this.editSubmitting) return;
    form?.form.markAllAsTouched();
    this.editError = null;
    if (form?.invalid) return;
    if (!(this.freshnessExpected <= this.freshnessWarn && this.freshnessWarn <= this.freshnessCrit)) {
      this.editError = 'Expected <= warning <= critical thresholds.';
      return;
    }
    if (this.stalenessMaxPctOld < 0 || this.stalenessMaxPctOld > 100) {
      this.editError = 'Max % old must be between 0 and 100.';
      return;
    }
    this.editSubmitting = true;
    this.api
      .createPrefix(this.bucketName, {
        prefix: this.prefix,
        freshnessExpectedIntervalMinutes: this.freshnessExpected,
        freshnessWarningThresholdMinutes: this.freshnessWarn,
        freshnessCriticalThresholdMinutes: this.freshnessCrit,
        stalenessAgeDays: this.stalenessAgeDays,
        stalenessMaxPctOld: this.stalenessMaxPctOld,
        partitionPattern: this.partitionPattern || undefined,
      })
      .subscribe({
        next: () => {
          this.editSubmitting = false;
          this.toast.show('Prefix settings saved.', 'success');
          this.closeEditModal();
          this.reload();
        },
        error: (err) => {
          this.editSubmitting = false;
          const msg = err?.error?.message || 'Unable to save prefix.';
          this.editError = msg;
          this.toast.show(msg, 'error', 5000);
        },
      });
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

  agePercent(val?: number): number {
    const hist = this.state$.value.health?.status?.ageHistogram;
    const total =
      (hist?.['0_7'] || 0) + (hist?.['7_30'] || 0) + (hist?.['30_90'] || 0) + (hist?.['90_plus'] || 0);
    if (!total || !val) return 0;
    return Math.min(100, (val / total) * 100);
  }

  storageEntries(breakdown?: Record<string, number> | null) {
    if (!breakdown) return [];
    return Object.entries(breakdown);
  }

  storagePercent(val: number, total?: number | null): number {
    if (!total || !val) return 0;
    return Math.min(100, (val / total) * 100);
  }

  ageBuckets = [
    { key: '0_7' as const, label: '0-7d' },
    { key: '7_30' as const, label: '7-30d' },
    { key: '30_90' as const, label: '30-90d' },
    { key: '90_plus' as const, label: '90d+' },
  ];

  pillVariantFromSeverity(sev?: string) {
    const s = (sev || '').toUpperCase();
    if (s === 'CRITICAL') return 'critical';
    if (s === 'WARN') return 'warning';
    return 'neutral';
  }
}
