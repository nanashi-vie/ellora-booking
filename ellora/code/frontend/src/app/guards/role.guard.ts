import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ProfileApiService, Profile } from '../services/profile-api.service';

export function roleHome(role: Profile['role']): string {
  return role === 'ADMIN' ? '/admin/dashboard' : role === 'SALON_OWNER' ? '/owner/dashboard' : '/';
}
// Customer-facing and sign-in routes must not become a second workspace for owners.
export const nonOwnerGuard: CanActivateFn = async (route, state) => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;
  const auth = inject(AuthService);
  const profiles = inject(ProfileApiService);
  const router = inject(Router);
  // Let the OAuth callback finish before resolving the profile and destination.
  if (route.routeConfig?.path === 'login' && route.queryParamMap.has('code')) return true;
  if (!await auth.isAuthenticated()) return true;
  try {
    const { role } = await profiles.getCurrentUser();
    if (role === 'SALON_OWNER' || (route.data['customerOnly'] && role !== 'CUSTOMER')) {
      return router.parseUrl(roleHome(role));
    }
    return true;
  } catch {
    return state.url.startsWith('/login') ? true : router.parseUrl('/login');
  }
};
export const roleGuard: CanActivateFn = async (route) => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;
  const auth = inject(AuthService);
  const profiles = inject(ProfileApiService);
  const router = inject(Router);
  if (!await auth.isAuthenticated()) return router.createUrlTree(['/login']);
  try {
    const profile = await profiles.getCurrentUser();
    const requiredRole = route.data['role'] ?? route.parent?.data['role'];
    return profile.role === requiredRole ? true : router.parseUrl(roleHome(profile.role));
  } catch { return router.createUrlTree(['/login']); }
};
