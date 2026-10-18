import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../app.routes';
import { AuthService } from '../../services/auth.service';
import { ProfileApiService } from '../../services/profile-api.service';
import { SubscriptionApiService } from '../../services/subscription-api.service';
import { BillingApiService } from '../../services/billing-api.service';
import { AdminNavigationComponent } from '../admin-content/admin-navigation.component';

@Component({ standalone: true, imports: [AdminNavigationComponent, RouterOutlet], template: '<app-admin-navigation/><router-outlet/>' }) class TestShell {}
@Component({ standalone: true, template: '<p>Trang kiểm thử</p>' }) class EmptyPage {}

describe('Subscription routes and navigation', () => {
  const auth = { isAuthenticated: vi.fn() }, profiles = { getCurrentUser: vi.fn() };
  const api = { plans: vi.fn(), owner: vi.fn(), ownerRequests: vi.fn(), adminPlans: vi.fn(), adminRequests: vi.fn() };
  beforeEach(() => {
    vi.resetAllMocks(); auth.isAuthenticated.mockResolvedValue(true); profiles.getCurrentUser.mockResolvedValue({ role: 'ADMIN' });
    api.plans.mockResolvedValue([]); api.owner.mockResolvedValue({ salonId: 7, effectiveTier: null, pendingRequest: null });
    api.adminPlans.mockResolvedValue([]); api.ownerRequests.mockResolvedValue({ content: [], pageNumber: 0, last: true, totalElements: 0 }); api.adminRequests.mockResolvedValue({ content: [], pageNumber: 0, last: true, totalElements: 0 });
    // Keep the production role guards, metadata, lazy page and navigation; unrelated dashboard shells are isolated.
    const scoped: Routes = ['admin', 'owner'].map(path => {
      const parent = routes.find(route => route.path === path)!;
      return { ...parent, loadComponent: () => Promise.resolve(TestShell), children: parent.children!.map(child => child.path === 'dashboard' ? { ...child, loadComponent: () => Promise.resolve(EmptyPage) } : child) };
    });
    TestBed.configureTestingModule({ providers: [provideRouter([...scoped, { path: 'login', component: EmptyPage }, { path: '', component: EmptyPage, pathMatch: 'full' }]), { provide: AuthService, useValue: auth }, { provide: ProfileApiService, useValue: profiles }, { provide: SubscriptionApiService, useValue: api }, { provide: BillingApiService, useValue: { config: vi.fn().mockResolvedValue({ qrUrl: null }) } }] });
  });
  afterEach(() => TestBed.resetTestingModule());
  it('uses the real admin menu to open the lazy subscriptions page under the admin parent', async () => {
    const harness = await RouterTestingHarness.create('/admin/dashboard');
    const link = harness.fixture.nativeElement.querySelector('a[href="/admin/subscriptions"]') as HTMLAnchorElement;
    expect(link.textContent?.trim()).toBe('Gói đăng ký'); link.click(); await harness.fixture.whenStable(); harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/admin/subscriptions'); expect(harness.fixture.nativeElement.querySelector('h1').textContent).toBe('Gói đăng ký salon'); expect(link.getAttribute('aria-current')).toBe('page');
    expect(api.adminPlans).toHaveBeenCalledOnce(); expect(api.owner).not.toHaveBeenCalled();
  });
  it('blocks unauthenticated and customer access, while an owner can open only the owner subscriptions page', async () => {
    auth.isAuthenticated.mockResolvedValue(false); const harness = await RouterTestingHarness.create('/owner/subscription'); const router = TestBed.inject(Router);
    expect(router.url).toBe('/login'); expect(api.owner).not.toHaveBeenCalled();
    auth.isAuthenticated.mockResolvedValue(true); profiles.getCurrentUser.mockResolvedValue({ role: 'CUSTOMER' }); await harness.navigateByUrl('/admin/subscriptions'); expect(router.url).toBe('/'); expect(api.adminPlans).not.toHaveBeenCalled();
    profiles.getCurrentUser.mockResolvedValue({ role: 'SALON_OWNER' }); await harness.navigateByUrl('/owner/subscription'); await harness.fixture.whenStable(); harness.detectChanges();
    expect(router.url).toBe('/owner/subscription'); expect(api.owner).toHaveBeenCalledOnce(); expect(harness.fixture.nativeElement.querySelector('h1').textContent).toBe('Gói đăng ký');
    await harness.navigateByUrl('/admin/subscriptions'); expect(router.url).toBe('/owner/dashboard'); expect(api.adminPlans).not.toHaveBeenCalled();
  });
});
