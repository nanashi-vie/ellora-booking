import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { apiConfig } from '../config/api.config';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(apiConfig.baseUrl)) {
    return next(request);
  }

  const path = request.url.slice(apiConfig.baseUrl.length).split(/[?#]/)[0];
  // Public reads do not need Cognito or the backend's authenticated-user lookups.
  if (request.method === 'GET' && (/^\/customer\/salons(?:\/|$)/.test(path) || path === '/ping' || path === '/salon-plans')) {
    return next(request);
  }
  const authService = inject(AuthService);

  return from(authService.getAccessToken()).pipe(
    switchMap((accessToken) => {
      if (!accessToken) {
        return next(request);
      }

      return next(
        request.clone({
          setHeaders: {
            Authorization: `Bearer ${accessToken}`,
          },
        }),
      );
    }),
  );
};
