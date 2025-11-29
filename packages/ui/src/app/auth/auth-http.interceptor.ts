import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

export const authHttpInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken;
  if (token) {
    const clone = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
    return next(clone);
  }
  return next(req);
};
