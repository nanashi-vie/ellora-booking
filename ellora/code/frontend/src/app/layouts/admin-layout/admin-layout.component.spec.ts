import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../app.routes';
import { AuthService } from '../../services/auth.service';
import { Profile, ProfileApiService } from '../../services/profile-api.service';
import { Header } from '../../shared/components/header/header.component';
import { AdminLayout } from './admin-layout.component';

@Component({ selector: 'app-header', standalone: true, template: '<header data-testid="site-header-stub"></header>' })
class HeaderStub {}

@Component({ standalone: true, template: '<section class="admin-page"><h1>{{ page }}</h1></section>' })
class AdminPageStub {
  readonly page = inject(ActivatedRoute).snapshot.routeConfig?.path;
}

@Component({ standalone: true, template: '<p>Trang chuyển hướng</p>' })
class RedirectStub {}

// Keep the production hierarchy/guards/redirects; replace only feature content and account UI.
function adminRoutes(): Routes {
  const admin = routes.find(route => route.path === 'admin');
  if (!admin) throw new Error('The administration workspace must have its own guarded route.');
  const { loadComponent, children, ...parent } = admin;
  return [
    { ...parent, component: AdminLayout, children: children?.map(({ loadComponent, ...child }) =>
      loadComponent ? { ...child, component: AdminPageStub } : child) },
    { path: 'login', component: RedirectStub },
    { path: 'owner/dashboard', component: RedirectStub },
    { path: '', pathMatch: 'full', component: RedirectStub },
  ];
}

describe('Shared administration workspace routes', () => {
  let role: Profile['role'];
  let authenticated: boolean;
  const profile = vi.fn();

  beforeEach(() => {
    role = 'ADMIN'; authenticated = true;
    profile.mockReset(); profile.mockImplementation(async () => ({ role }));
    TestBed.configureTestingModule({ providers: [provideRouter(adminRoutes()),
      { provide: AuthService, useValue: { isAuthenticated: async () => authenticated } },
      { provide: ProfileApiService, useValue: { getCurrentUser: profile } },
    ] });
    TestBed.overrideComponent(AdminLayout, { remove: { imports: [Header] }, add: { imports: [HeaderStub] } });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('keeps one frame, header and navigation when switching child pages with active menu state', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/dashboard', AdminLayout);
    const shell = harness.routeNativeElement!;
    const frame = shell.querySelector('.admin-layout-frame');
    const navigation = shell.querySelector('nav[aria-label="Điều hướng quản trị"]')!;
    const header = shell.querySelector('app-header');
    expect(navigation.querySelector('a[href="/admin/dashboard"]')?.getAttribute('aria-current')).toBe('page');
    expect(shell.querySelectorAll('app-admin-navigation')).toHaveLength(1);
    expect(shell.querySelectorAll('main')).toHaveLength(1);
    expect(shell.querySelector('app-footer')).toBeNull();

    navigation.querySelector<HTMLAnchorElement>('a[href="/admin/users"]')!.click();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/admin/users');
    expect(harness.routeNativeElement).toBe(shell);
    expect(shell.querySelector('.admin-layout-frame')).toBe(frame);
    expect(shell.querySelector('nav[aria-label="Điều hướng quản trị"]')).toBe(navigation);
    expect(shell.querySelector('app-header')).toBe(header);
    expect(navigation.querySelector('a[href="/admin/users"]')?.getAttribute('aria-current')).toBe('page');
    expect(navigation.querySelector('a[href="/admin/dashboard"]')?.hasAttribute('aria-current')).toBe(false);
    expect(shell.querySelector('h1')?.textContent).toBe('users');
  });

  it('preserves every existing admin deep link under the same shell', async () => {
    const harness = await RouterTestingHarness.create();
    for (const page of ['dashboard', 'users', 'content', 'billing', 'approvals', 'booking-disputes']) {
      await harness.navigateByUrl('/admin/' + page, AdminLayout);
      expect(TestBed.inject(Router).url).toBe('/admin/' + page);
      expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe(page);
      expect(harness.routeNativeElement?.querySelectorAll('app-admin-navigation')).toHaveLength(1);
    }
  });

  it('redirects the admin workspace root to its dashboard', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin', AdminLayout);
    expect(TestBed.inject(Router).url).toBe('/admin/dashboard');
  });

  it.each([['CUSTOMER', '/'], ['SALON_OWNER', '/owner/dashboard']] as const)(
    'denies direct admin entry for %s and uses the existing role destination', async (currentRole, destination) => {
      role = currentRole;
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/admin/booking-disputes');
      expect(TestBed.inject(Router).url).toBe(destination);
      expect(harness.routeNativeElement?.querySelector('app-admin-navigation')).toBeNull();
    });

  it('redirects signed-out users to login before rendering the administration frame', async () => {
    authenticated = false;
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/billing');
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(harness.routeNativeElement?.querySelector('.admin-layout-frame')).toBeNull();
    expect(profile).not.toHaveBeenCalled();
  });

  it('checks the real child guard again when admin access is revoked inside the workspace', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/dashboard', AdminLayout);
    role = 'CUSTOMER';
    await harness.navigateByUrl('/admin/users');
    expect(TestBed.inject(Router).url).toBe('/');
    expect(harness.routeNativeElement?.querySelector('app-admin-navigation')).toBeNull();
  });

  it('fails closed if the account profile cannot be verified', async () => {
    profile.mockRejectedValue(new Error('offline'));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/content');
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(harness.routeNativeElement?.querySelector('.admin-layout-frame')).toBeNull();
  });
});
