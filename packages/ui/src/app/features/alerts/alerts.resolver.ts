import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, ResolveFn } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { Alert } from '../../services/api.types';

export interface AlertsResolved {
  alerts: Alert[];
  nextToken?: string;
  error?: string;
}

export const alertsResolver: ResolveFn<AlertsResolved> = (_route: ActivatedRouteSnapshot) => {
  const api = inject(ApiService);
  return api.getAlerts({ limit: 50 }).pipe(
    map((resp) => ({ alerts: resp.items, nextToken: resp.nextToken })),
    catchError((err) =>
      of({
        alerts: [],
        error: err?.error?.message || 'Unable to load alerts',
      }),
    ),
  );
};
