import { inject } from '@angular/core';
import { ResolveFn, ActivatedRouteSnapshot } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { GetBucketPrefixesResponse } from '../../services/api.types';

export interface BucketDetailResolved {
  data?: GetBucketPrefixesResponse;
  error?: string;
}

export const bucketDetailResolver: ResolveFn<BucketDetailResolved> = (route: ActivatedRouteSnapshot) => {
  const api = inject(ApiService);
  const bucketName = route.paramMap.get('bucketName') ?? '';

  return api.getBucketPrefixes(bucketName).pipe(
    map((data) => ({ data })),
    catchError((err) =>
      of({
        error: err?.error?.message || 'Unable to load bucket details',
      }),
    ),
  );
};
