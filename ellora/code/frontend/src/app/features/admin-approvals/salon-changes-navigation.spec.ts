import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../app.routes';
import { AdminLayout } from '../../layouts/admin-layout/admin-layout.component';
import { AuthService } from '../../services/auth.service';
import { Profile, ProfileApiService } from '../../services/profile-api.service';
import {
  SalonProfileChange,
  SalonRegistration,
  SalonRegistrationService,
} from '../../services/salon-registration.service';
import { Header } from '../../shared/components/header/header.component';
import { AdminApprovalsComponent } from './admin-approvals.component';
import { SalonChangesComponent } from './salon-changes.component';

@Component({ selector: 'app-header', standalone: true, template: '<header></header>' })
class HeaderStub {}

@Component({ standalone: true, template: '<p>Trang quản trị khác</p>' })
class OtherAdminPageStub {}

@Component({ standalone: true, template: '<p>Trang chuyển hướng</p>' })
class RedirectStub {}

// Keep the production lazy layout, review pages, route metadata and guards.
function moderationRoutes(): Routes {
  const admin = routes.find(route => route.path === 'admin');
  if (!admin) throw new Error('The guarded administration route must exist.');
  return [
    { ...admin, children: admin.children?.map(child => {
      if (!child.loadComponent || child.path === 'salon-changes' || child.path === 'approvals') return child;
      const { loadComponent, ...route } = child;
      return { ...route, component: OtherAdminPageStub };
    }) },
    { path: 'login', component: RedirectStub },
    { path: 'owner/dashboard', component: RedirectStub },
    { path: '', pathMatch: 'full', component: RedirectStub },
  ];
}

const profile = {
  name: 'Tiệm Hoa Hồng', description: 'Chăm sóc móng', address: '12 Lê Lợi',
  city: 'TP. Hồ Chí Minh', district: 'Quận 1', phone: '0901234567', email: 'salon@example.com',
  latitude: 10.77, longitude: 106.7,
};
const coverChange: SalonProfileChange = {
  id: 817, salonId: 42, salonName: profile.name, current: profile, proposed: profile,
  status: 'PENDING', kind: 'COVER', submittedAt: '2026-10-18T02:00:00Z', reviewedAt: null,
  currentLogoUrl: 'https://example.com/current-cover.png',
  proposedLogoUrl: 'https://example.com/proposed-cover.png',
  currentImageUrls: [], proposedImageUrls: null,
};
const registration: SalonRegistration = {
  ...profile, id: 53, name: 'Tiệm đăng ký mới', ownerName: 'Nguyễn Lan', ownerId: 'owner-53',
  status: 'PENDING_APPROVAL',
};

describe('Admin salon change review navigation', () => {
  let role: Profile['role'];
  let authenticated: boolean;
  const currentUser = vi.fn();
  const api = {
    changes: vi.fn(), decideChange: vi.fn(), pending: vi.fn(), detail: vi.fn(), decide: vi.fn(),
  };

  beforeEach(() => {
    role = 'ADMIN'; authenticated = true;
    currentUser.mockReset().mockImplementation(async () => ({ role }));
    api.changes.mockReset().mockResolvedValue({ content: [coverChange], last: true });
    api.decideChange.mockReset().mockResolvedValue(undefined);
    api.pending.mockReset().mockResolvedValue({ content: [registration], last: true });
    api.detail.mockReset().mockResolvedValue(registration);
    api.decide.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({ providers: [
      provideRouter(moderationRoutes()),
      { provide: AuthService, useValue: { isAuthenticated: async () => authenticated } },
      { provide: ProfileApiService, useValue: { getCurrentUser: currentUser } },
      { provide: SalonRegistrationService, useValue: api },
    ] });
    TestBed.overrideComponent(AdminLayout, {
      remove: { imports: [Header] }, add: { imports: [HeaderStub] },
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  async function settle(harness: RouterTestingHarness) {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  function button(root: Element, label: string): HTMLButtonElement {
    const match = Array.from(root.querySelectorAll('button')).find(item => item.textContent?.trim() === label);
    if (!match) throw new Error(`Missing action: ${label}`);
    return match;
  }

  async function openReview() {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/salon-changes', AdminLayout);
    await settle(harness);
    return harness;
  }

  it('opens the real pending cover queue from the real administration navigation', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/dashboard', AdminLayout);
    const shell = harness.routeNativeElement!;
    const navigation = shell.querySelector('nav[aria-label="Điều hướng quản trị"]')!;
    const link = navigation.querySelector<HTMLAnchorElement>('a[href="/admin/salon-changes"]')!;
    expect(link).not.toBeNull();
    expect(link.textContent?.trim()).toBe('Duyệt cập nhật');
    expect(navigation.querySelector('a[href="/admin/approvals"]')?.textContent?.trim()).toBe('Duyệt đăng ký');

    link.click();
    await settle(harness);
    expect(TestBed.inject(Router).url).toBe('/admin/salon-changes');
    expect(harness.routeNativeElement).toBe(shell);
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(harness.routeDebugElement!.query(By.directive(SalonChangesComponent))).not.toBeNull();
    expect(shell.querySelectorAll('h1')).toHaveLength(1);
    expect(shell.querySelector('h1')?.textContent?.trim()).toBe('Duyệt thông tin, ảnh và vị trí salon');
    expect(shell.querySelector('.admin-page-header')?.textContent).toContain('thông tin');
    expect(shell.querySelector('.admin-page-header')?.textContent).toContain('ảnh');
    expect(shell.querySelector('.admin-page-header')?.textContent).toContain('vị trí');
    expect(shell.textContent).toContain(coverChange.salonName);
    expect(shell.textContent).toContain('Ảnh đại diện');
    expect(api.changes).toHaveBeenCalledExactlyOnceWith(0);
    expect(api.pending).not.toHaveBeenCalled();

    button(shell, 'Xem thay đổi').click();
    harness.detectChanges();
    const preview = shell.querySelector('app-salon-change-preview')!;
    expect(preview).not.toBeNull();
    expect(preview.textContent).toContain('Ảnh đang hiển thị');
    expect(preview.textContent).toContain('Ảnh sau khi duyệt');
    expect(preview.querySelector('img[alt="Ảnh đại diện hiện tại"]')?.getAttribute('src')).toBe(coverChange.currentLogoUrl);
    expect(preview.querySelector('img[alt="Ảnh đại diện đề nghị"]')?.getAttribute('src')).toBe(coverChange.proposedLogoUrl);
    expect(api.decideChange).not.toHaveBeenCalled();
  });

  it.each([
    ['approve', 'Duyệt cập nhật', 'Đã duyệt và cập nhật hồ sơ salon.'],
    ['reject', 'Từ chối cập nhật', 'Đã từ chối. Hồ sơ salon được giữ nguyên.'],
  ] as const)('submits %s with the immutable change id and refreshes the real queue', async (action, label, message) => {
    const harness = await openReview();
    const shell = harness.routeNativeElement!;
    button(shell, 'Xem thay đổi').click();
    harness.detectChanges();
    api.changes.mockResolvedValue({ content: [], last: true });
    button(shell, label).click();
    await settle(harness);

    expect(api.decideChange).toHaveBeenCalledExactlyOnceWith(coverChange.id, action);
    expect(api.decide).not.toHaveBeenCalled();
    expect(api.changes).toHaveBeenCalledTimes(2);
    expect(api.changes).toHaveBeenLastCalledWith(0);
    expect(shell.textContent).toContain(message);
    expect(shell.textContent).toContain('Không có yêu cầu cập nhật chờ duyệt.');
    expect(shell.querySelector('app-salon-change-preview')).toBeNull();
  });

  it('keeps new salon registration review separate and reachable through its existing production route', async () => {
    const harness = await openReview();
    const shell = harness.routeNativeElement!;
    const link = shell.querySelector<HTMLAnchorElement>('nav a[href="/admin/approvals"]')!;
    expect(link.textContent?.trim()).toBe('Duyệt đăng ký');
    link.click();
    await settle(harness);

    expect(TestBed.inject(Router).url).toBe('/admin/approvals');
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(harness.routeDebugElement!.query(By.directive(AdminApprovalsComponent))).not.toBeNull();
    expect(harness.routeDebugElement!.query(By.directive(SalonChangesComponent))).toBeNull();
    expect(shell.querySelector('h1')?.textContent?.trim()).toBe('Duyệt đăng ký salon');
    expect(shell.textContent).toContain(registration.name);
    expect(api.pending).toHaveBeenCalledExactlyOnceWith(0);

    button(shell, 'Xem hồ sơ').click();
    await settle(harness);
    expect(api.detail).toHaveBeenCalledExactlyOnceWith(registration.id);
    expect(shell.querySelector('[aria-label="Hồ sơ đăng ký"]')?.textContent).toContain(registration.ownerName);
    expect(api.decideChange).not.toHaveBeenCalled();
  });

  it.each([
    ['CUSTOMER', '/'], ['SALON_OWNER', '/owner/dashboard'],
  ] as const)('denies the new deep link for %s with the production role guard', async (currentRole, destination) => {
    role = currentRole;
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/salon-changes');
    expect(TestBed.inject(Router).url).toBe(destination);
    expect(harness.routeNativeElement?.querySelector('app-admin-navigation')).toBeNull();
    expect(api.changes).not.toHaveBeenCalled();
  });

  it('redirects signed-out visitors before loading pending salon changes', async () => {
    authenticated = false;
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/salon-changes');
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(harness.routeNativeElement?.querySelector('.admin-layout-frame')).toBeNull();
    expect(currentUser).not.toHaveBeenCalled();
    expect(api.changes).not.toHaveBeenCalled();
  });

  it('rechecks the production child guard before entering the update queue', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/dashboard', AdminLayout);
    role = 'CUSTOMER';
    await harness.navigateByUrl('/admin/salon-changes');
    expect(TestBed.inject(Router).url).toBe('/');
    expect(harness.routeNativeElement?.querySelector('app-admin-navigation')).toBeNull();
    expect(api.changes).not.toHaveBeenCalled();
  });
});
