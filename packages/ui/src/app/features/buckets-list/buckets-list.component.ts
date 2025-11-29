import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AsyncPipe, DatePipe, DecimalPipe, NgFor, NgIf } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { BpButtonComponent, BpCardComponent, BpPillComponent, BpModalComponent, BpToastService } from '../../ui';
import { ApiService } from '../../services/api.service';
import { BucketSummary } from '../../services/api.types';

type StatusFilter = 'ALL' | 'OK' | 'DEGRADING' | 'CRITICAL' | 'UNKNOWN';

@Component({
  selector: 'bp-buckets-list',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    BpButtonComponent,
    BpCardComponent,
    BpPillComponent,
    BpModalComponent,
    AsyncPipe,
    NgIf,
    NgFor,
    DatePipe,
    DecimalPipe,
  ],
  template: `
    <section class="section">
      <header class="section__header buckets__header">
        <div>
          <p class="eyebrow">Overview</p>
          <h1>Buckets</h1>
          <p class="muted">Registered S3 buckets monitored by BucketPulse</p>
        </div>
        <div class="actions">
          <bp-button variant="primary" (click)="openRegisterModal()">+ Register bucket</bp-button>
        </div>
      </header>

      <div class="buckets__kpi" *ngIf="!loading && !error">
        <bp-card [dense]="true" [showHeaderDivider]="false">
          <div class="kpi-card">
            <div class="kpi-card__label">Total buckets</div>
            <div class="kpi-card__value">{{ buckets.length }}</div>
          </div>
        </bp-card>
        <bp-card [dense]="true" [showHeaderDivider]="false">
          <div class="kpi-card">
            <div class="kpi-card__label">Buckets with issues</div>
            <div class="kpi-card__value">{{ bucketsWithIssues }}</div>
          </div>
        </bp-card>
        <bp-card [dense]="true" [showHeaderDivider]="false">
          <div class="kpi-card">
            <div class="kpi-card__label">Tracked prefixes</div>
            <div class="kpi-card__value">{{ totalTrackedPrefixes }}</div>
          </div>
        </bp-card>
        <bp-card [dense]="true" [showHeaderDivider]="false">
          <div class="kpi-card">
            <div class="kpi-card__label">Alerts last 24h</div>
            <div class="kpi-card__value">0</div>
          </div>
        </bp-card>
      </div>

      <bp-card *ngIf="error" title="Unable to load buckets">
        <p class="muted">{{ error }}</p>
        <bp-button variant="secondary" (click)="fetchBuckets()">Retry</bp-button>
      </bp-card>

      <bp-card *ngIf="!error" class="buckets__card">
        <div class="buckets__filters">
          <input
            type="text"
            class="buckets__search"
            placeholder="Search by bucket or region..."
            [ngModel]="searchTerm"
            (ngModelChange)="onSearchChange($event)"
          />
          <div class="buckets__chips">
            <button class="chip" [class.chip--active]="statusFilter === 'ALL'" (click)="setStatusFilter('ALL')">
              All
            </button>
            <button class="chip" [class.chip--active]="statusFilter === 'OK'" (click)="setStatusFilter('OK')">
              OK
            </button>
            <button
              class="chip"
              [class.chip--active]="statusFilter === 'DEGRADING'"
              (click)="setStatusFilter('DEGRADING')"
            >
              Degrading
            </button>
            <button
              class="chip"
              [class.chip--active]="statusFilter === 'CRITICAL'"
              (click)="setStatusFilter('CRITICAL')"
            >
              Stalled
            </button>
            <button
              class="chip"
              [class.chip--active]="statusFilter === 'UNKNOWN'"
              (click)="setStatusFilter('UNKNOWN')"
            >
              Unknown
            </button>
          </div>
        </div>

        <div *ngIf="loading" class="muted">Loading buckets...</div>
        <div *ngIf="!loading && buckets.length === 0" class="empty-state">
          <p class="muted">No buckets registered yet.</p>
          <bp-button variant="primary" (click)="openRegisterModal()">Register your first bucket</bp-button>
        </div>
        <div *ngIf="!loading && buckets.length > 0 && filteredBuckets.length === 0" class="muted">
          No buckets match your filters.
        </div>

        <table class="buckets__table" *ngIf="!loading && filteredBuckets.length > 0">
          <thead>
            <tr>
              <th>Bucket</th>
              <th>Region</th>
              <th>Status</th>
              <th>Tracked prefixes</th>
              <th>Total objects</th>
              <th>Last evaluated</th>
            </tr>
          </thead>
          <tbody>
            <tr
              *ngFor="let b of filteredBuckets"
              class="buckets__row"
              (click)="onRowClick(b)"
              tabindex="0"
              role="button"
            >
              <td>{{ b.bucketName }}</td>
              <td>{{ b.region }}</td>
              <td>
                <bp-pill [variant]="pillVariant(b.status)">{{ b.status }}</bp-pill>
              </td>
              <td>{{ b.trackedPrefixesCount ?? '—' }}</td>
              <td>{{ b.totalObjects ?? '—' }}</td>
              <td>{{ b.lastEvaluatedAt ? (b.lastEvaluatedAt | date: 'short') : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </bp-card>

      <bp-modal
        [open]="registerModalOpen"
        title="Register bucket"
        subtitle="Add an S3 bucket to monitor"
        (close)="closeRegisterModal()"
      >
        <form class="register-form" #registerForm="ngForm" (ngSubmit)="submitRegister(registerForm)">
          <label>
            Bucket name
            <input
              type="text"
              required
              [pattern]="bucketNamePattern.source"
              [(ngModel)]="registerBucketName"
              name="bucketName"
              #bucketName="ngModel"
            />
            <p class="form-hint" *ngIf="bucketName.invalid && bucketName.touched">
              Bucket names must be 3-63 characters, lowercase letters, numbers, dots or hyphens, and start/end with a
              letter or number.
            </p>
          </label>
          <label>
            Region
            <input
              type="text"
              required
              [pattern]="regionPattern.source"
              [(ngModel)]="registerRegion"
              name="region"
              #region="ngModel"
            />
            <p class="form-hint" *ngIf="region.invalid && region.touched">
              Use an AWS region like <code>us-east-1</code>.
            </p>
          </label>
          <label>
            Display name (optional)
            <input type="text" [(ngModel)]="registerDisplayName" name="displayName" />
          </label>
        </form>
        <p class="form-error" *ngIf="registerError">{{ registerError }}</p>
        <div modalFooter>
          <bp-button variant="secondary" (click)="closeRegisterModal()">Cancel</bp-button>
          <bp-button
            variant="primary"
            type="submit"
            [disabled]="registerSubmitting || !!registerForm?.invalid"
            (click)="submitRegister(registerForm)"
          >
            {{ registerSubmitting ? 'Registering...' : 'Register' }}
          </bp-button>
        </div>
      </bp-modal>
    </section>
  `,
  styleUrls: ['./buckets-list.component.scss'],
})
export class BucketsListComponent {
  buckets: BucketSummary[] = [];
  loading = true;
  error: string | null = null;
  searchTerm = '';
  statusFilter: StatusFilter = 'ALL';
  bucketsWithIssues = 0;
  totalTrackedPrefixes = 0;
  private searchInput$ = new Subject<string>();
  registerModalOpen = false;
  registerBucketName = '';
  registerRegion = '';
  registerDisplayName = '';
  registerSubmitting = false;
  registerError: string | null = null;
  readonly bucketNamePattern = /^[a-z0-9](?:[a-z0-9.-]{1,61}[a-z0-9])$/;
  readonly regionPattern = /^[a-z]{2}-[a-z]+-\\d$/;

  constructor(
    private readonly api: ApiService,
    private readonly router: Router,
    private readonly toast: BpToastService,
  ) {
    this.searchInput$.pipe(debounceTime(300), distinctUntilChanged()).subscribe((term) => {
      this.searchTerm = term;
    });
    this.fetchBuckets();
  }

  get filteredBuckets(): BucketSummary[] {
    const term = this.searchTerm.trim().toLowerCase();
    return this.buckets
      .filter((b) => this.filterByStatus(b))
      .filter((b) => {
        if (!term) return true;
        return (
          b.bucketName.toLowerCase().includes(term) ||
          (b.region ?? '').toLowerCase().includes(term)
        );
      })
      .sort((a, b) => this.sortBuckets(a, b));
  }

  setStatusFilter(filter: StatusFilter) {
    this.statusFilter = filter;
  }

  onRowClick(bucket: BucketSummary) {
    this.router.navigate(['/buckets', bucket.bucketName]);
  }

  pillVariant(status?: string) {
    const s = (status || '').toUpperCase();
    if (s === 'OK') return 'ok';
    if (s === 'DEGRADING') return 'warning';
    if (s === 'CRITICAL' || s === 'STALLED') return 'critical';
    return 'unknown';
  }

  onSearchChange(term: string) {
    this.searchInput$.next(term);
  }

  openRegisterModal() {
    this.registerModalOpen = true;
    this.registerError = null;
  }

  closeRegisterModal() {
    this.registerModalOpen = false;
    this.registerBucketName = '';
    this.registerRegion = '';
    this.registerDisplayName = '';
    this.registerError = null;
  }

  submitRegister(form?: NgForm) {
    if (!form?.valid || this.registerSubmitting) {
      form?.form.markAllAsTouched();
      return;
    }
    this.registerError = null;
    this.registerSubmitting = true;
    this.api
      .createBucket({
        bucketName: this.registerBucketName.trim(),
        region: this.registerRegion.trim(),
        displayName: this.registerDisplayName?.trim() || undefined,
      })
      .subscribe({
        next: (created) => {
          this.buckets = [...this.buckets, created];
          this.computeKpis();
          this.registerSubmitting = false;
          this.closeRegisterModal();
          this.toast.show('Bucket registered successfully.', 'success');
        },
        error: (err) => {
          console.error('Failed to register bucket', err);
          const msg = err?.error?.message || 'Unable to register bucket. Please try again.';
          this.registerError = msg;
          this.registerSubmitting = false;
          this.toast.show(msg, 'error', 5000);
        },
      });
  }

  fetchBuckets() {
    this.loading = true;
    this.error = null;
    this.api.getBuckets().subscribe({
      next: (resp) => {
        this.buckets = resp.buckets;
        this.computeKpis();
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load buckets', err);
        this.error = 'Unable to load buckets';
        this.loading = false;
      },
    });
  }

  private filterByStatus(bucket: BucketSummary): boolean {
    switch (this.statusFilter) {
      case 'OK':
        return bucket.status === 'OK';
      case 'DEGRADING':
        return bucket.status === 'DEGRADING';
      case 'CRITICAL':
        return bucket.status === ('CRITICAL' as any) || bucket.status === ('STALLED' as any);
      case 'UNKNOWN':
        return bucket.status === 'UNKNOWN';
      case 'ALL':
      default:
        return true;
    }
  }

  private sortBuckets(a: BucketSummary, b: BucketSummary): number {
    const score = (s: string | undefined) => {
      const v = (s || '').toUpperCase();
      if (v === 'CRITICAL' || v === 'STALLED') return 0;
      if (v === 'DEGRADING') return 1;
      if (v === 'OK') return 2;
      return 3; // UNKNOWN or other
    };
    const sA = score(a.status);
    const sB = score(b.status);
    if (sA !== sB) return sA - sB;
    return a.bucketName.localeCompare(b.bucketName);
  }

  private computeKpis() {
    this.bucketsWithIssues = this.buckets.filter((b) => (b.status || '').toUpperCase() !== 'OK').length;
    this.totalTrackedPrefixes = this.buckets.reduce(
      (sum, b) => sum + (b.trackedPrefixesCount ?? 0),
      0,
    );
  }
}
