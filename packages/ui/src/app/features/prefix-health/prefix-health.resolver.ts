import { ActivatedRouteSnapshot, ResolveFn } from '@angular/router';
import { inject } from '@angular/core';
import { catchError, forkJoin, map, of } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { Alert, GetPrefixHealthResponse, PrefixEvaluation } from '../../services/api.types';

export interface PrefixHealthResolved {
  health?: GetPrefixHealthResponse;
  alerts: Alert[];
  evaluations: PrefixEvaluation[];
  nextToken?: string;
  error?: string;
}

export const prefixHealthResolver: ResolveFn<PrefixHealthResolved> = (route: ActivatedRouteSnapshot) => {
  const api = inject(ApiService);
  const bucketName = route.paramMap.get('bucketName') ?? '';
  const prefixParam = route.paramMap.get('prefix') ?? '';
  const prefix = decodeURIComponent(prefixParam);

  const health$ = api.getPrefixHealth(bucketName, prefix);
  const alerts$ = api.getAlerts({ bucketName, prefix, limit: 20 });
  const evals$ = api.getPrefixEvaluations(bucketName, prefix, { limit: 20 });

  return forkJoin([health$, alerts$, evals$]).pipe(
    map(([health, alerts, evaluations]) => ({
      health,
      alerts: alerts.items,
      evaluations: evaluations.items,
      nextToken: evaluations.nextToken,
    })),
    catchError((err) =>
      of({
        alerts: [],
        evaluations: [],
        error: err?.error?.message || 'Unable to load prefix health',
      }),
    ),
  );
};
