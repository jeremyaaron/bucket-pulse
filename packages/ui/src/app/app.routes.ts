import { Routes } from '@angular/router';
import { BucketsListComponent } from './features/buckets-list/buckets-list.component';
import { BucketDetailComponent } from './features/bucket-detail/bucket-detail.component';
import { bucketDetailResolver } from './features/bucket-detail/bucket-detail.resolver';
import { PrefixHealthComponent } from './features/prefix-health/prefix-health.component';
import { prefixHealthResolver } from './features/prefix-health/prefix-health.resolver';
import { AlertsComponent } from './features/alerts/alerts.component';
import { alertsResolver } from './features/alerts/alerts.resolver';
import { ExplorerComponent } from './features/explorer/explorer.component';
import { explorerResolver } from './features/explorer/explorer.resolver';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'buckets' },
  { path: 'buckets', component: BucketsListComponent, canActivate: [authGuard] },
  {
    path: 'buckets/:bucketName',
    component: BucketDetailComponent,
    canActivate: [authGuard],
    resolve: { bucketData: bucketDetailResolver },
  },
  {
    path: 'buckets/:bucketName/prefixes/:prefix',
    component: PrefixHealthComponent,
    canActivate: [authGuard],
    resolve: { prefixData: prefixHealthResolver },
  },
  { path: 'alerts', component: AlertsComponent, canActivate: [authGuard], resolve: { alertsData: alertsResolver } },
  { path: 'explorer', component: ExplorerComponent, canActivate: [authGuard], resolve: { explorerData: explorerResolver } },
  { path: '**', redirectTo: 'buckets' },
];
