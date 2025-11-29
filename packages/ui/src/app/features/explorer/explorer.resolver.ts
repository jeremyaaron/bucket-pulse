import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { ExplorerObject } from '../../services/api.types';

export interface ExplorerResolved {
  items: ExplorerObject[];
  nextToken?: string;
  error?: string;
}

export const explorerResolver: ResolveFn<ExplorerResolved> = () => {
  const api = inject(ApiService);
  return api.explorerQuery({ bucketName: 'default', limit: 50 }).pipe(
    // Caller should set real bucket before shipping; fallback ensures shell renders
    catchError((err) =>
      of({
        items: [],
        error: err?.error?.message || 'Unable to load explorer data',
      }),
    ),
  );
};
