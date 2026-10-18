import { Component, PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../services/auth.service';
import { Profile, ProfileApiService } from '../../../services/profile-api.service';
import { Header } from './header.component';

@Component({ standalone: true, template: '' }) class DestinationPage {}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}

const profile = (role: Profile['role'] = 'ADMIN'): Profile => ({
  id: 'canonical-user', email: 'admin@ellora.test', fullName: 'Quản trị Ellora', role,
});

describe('Header canonical role navigation', () => {
  const isAuthenticated = vi.fn<() => Promise<boolean>>();
  const getCurrentUser = vi.fn<() => Promise<Profile>>();
  const getUserProfile = vi.fn();
  const logout = vi.fn<() => Promise<void>>();
  let fixture: ComponentFixture<Header>;
  let fixtures: ComponentFixture<Header>[];
  let router: Router;

  beforeEach(() => {
    fixtures = [];
    isAuthenticated.mockReset().mockResolvedValue(true);
    getCurrentUser.mockReset().mockResolvedValue(profile());
    getUserProfile.mockReset().mockResolvedValue({ name: 'Cognito spoof', role: 'ADMIN', groups: ['ADMIN'] });
    logout.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({ imports: [Header], providers: [
      provideRouter(['', 'salon/:id', 'search', 'for-business', 'admin/dashboard', 'setting/profile',
        'setting/security', 'setting/my-bookings', 'login'].map(path => ({ path, component: DestinationPage }))),
      { provide: AuthService, useValue: { isAuthenticated, getUserProfile, logout } },
      { provide: ProfileApiService, useValue: { getCurrentUser } },
    ] });
  });

  afterEach(() => {
    fixtures.forEach(value => { if (!value.componentRef.hostView.destroyed) value.destroy(); });
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  async function mount(url = '/salon/1', waitForInit = true) {
    router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    fixture = TestBed.createComponent(Header);
    fixtures.push(fixture);
    fixture.detectChanges();
    if (waitForInit) await settle();
    return fixture.componentInstance;
  }

  async function settle() {
    await Promise.resolve();
    await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function element<T extends HTMLElement = HTMLElement>(selector: string): T {
    const result = fixture.nativeElement.querySelector(selector) as T | null;
    expect(result, selector).not.toBeNull();
    return result!;
  }

  function click(selector: string) {
    element(selector).click();
    fixture.detectChanges();
  }

  function controlIds(selector: string): string[] {
    return Array.from(element(selector).querySelectorAll<HTMLElement>('a, button')).map(value => value.id);
  }

  function expectNoAccountDestinations() {
    expect(fixture.nativeElement.querySelector('#header-dashboard, #dropdown-dashboard, #mobile-dashboard')).toBeNull();
    expect(fixture.nativeElement.querySelector('[id^="dropdown-profile"], #dropdown-security, #dropdown-bookings, #dropdown-rewards')).toBeNull();
    expect(fixture.nativeElement.querySelector('#mobile-profile, #mobile-security, #mobile-bookings, #mobile-rewards')).toBeNull();
  }

  it('uses one canonical ADMIN profile for the desktop menu, display name and dashboard return', async () => {
    await mount();
    expect(element<HTMLAnchorElement>('#header-dashboard').getAttribute('href')).toBe('/admin/dashboard');
    expect(fixture.nativeElement.querySelector('a[href="/for-business"]')).toBeNull();
    expect(element('#header-avatar-btn').getAttribute('aria-expanded')).toBe('false');
    click('#header-avatar-btn');
    expect(element('#header-avatar-btn').getAttribute('aria-expanded')).toBe('true');
    expect(element('#header-avatar-btn').getAttribute('aria-controls')).toBe('header-dropdown-menu');
    expect(controlIds('#header-dropdown-menu')).toEqual(['dropdown-dashboard', 'dropdown-logout']);
    expect(element('.header-dropdown__name').textContent).toContain('Quản trị Ellora');
    expect(fixture.nativeElement.textContent).not.toContain('Cognito spoof');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(element('#header-avatar-btn').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(element('#header-avatar-btn'));
    click('#header-avatar-btn');
    click('#dropdown-dashboard'); await settle();
    expect(router.url).toBe('/admin/dashboard');
    expect(fixture.nativeElement.querySelector('#header-dropdown-menu')).toBeNull();

    click('#header-avatar-btn');
    const navigate = vi.spyOn(router, 'navigateByUrl');
    click('#dropdown-dashboard'); await settle();
    expect(router.url).toBe('/admin/dashboard');
    expect(fixture.nativeElement.querySelector('#header-dropdown-menu')).toBeNull();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(isAuthenticated).toHaveBeenCalledTimes(1);
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    expect(getUserProfile).not.toHaveBeenCalled();
  });

  it('gives ADMIN native logo and mobile dashboard links that also close on the current URL', async () => {
    await mount();
    expect(element<HTMLAnchorElement>('#header-logo').getAttribute('href')).toBe('/admin/dashboard');
    expect(element('#header-logo').getAttribute('aria-label')).toBe('Về bảng điều khiển quản trị');
    click('#header-dashboard'); await settle();
    expect(router.url).toBe('/admin/dashboard');
    await router.navigateByUrl('/salon/2'); fixture.detectChanges();
    click('#header-logo'); await settle();
    expect(router.url).toBe('/admin/dashboard');

    click('#mobile-menu-btn');
    expect(element('#mobile-menu-btn').getAttribute('aria-expanded')).toBe('true');
    expect(element('#mobile-menu-btn').getAttribute('aria-controls')).toBe('mobile-menu-panel');
    expect(controlIds('#mobile-menu-panel')).toEqual(['mobile-dashboard', 'mobile-logout']);
    expect(element<HTMLAnchorElement>('#mobile-dashboard').getAttribute('href')).toBe('/admin/dashboard');
    const navigate = vi.spyOn(router, 'navigateByUrl');
    click('#mobile-dashboard'); await settle();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(router.url).toBe('/admin/dashboard');
    expect(fixture.nativeElement.querySelector('#mobile-menu-panel')).toBeNull();
    expect(element('#mobile-menu-btn').getAttribute('aria-expanded')).toBe('false');
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('keeps CUSTOMER account actions and valid mobile routes even when URL and Cognito claim ADMIN', async () => {
    getCurrentUser.mockResolvedValue({ ...profile('CUSTOMER'), fullName: 'Khách Ellora' });
    await mount('/admin/dashboard');
    expect(element<HTMLAnchorElement>('#header-logo').getAttribute('href')).toBe('/');
    expect(element('a[href="/for-business"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#header-dashboard')).toBeNull();
    const destinations = [['profile', '/setting/profile'], ['security', '/setting/security'], ['bookings', '/setting/my-bookings']];
    for (const [suffix, destination] of destinations) {
      click('#header-avatar-btn');
      expect(controlIds('#header-dropdown-menu')).toEqual(['dropdown-profile', 'dropdown-security', 'dropdown-bookings', 'dropdown-rewards', 'dropdown-logout']);
      expect(element('.header-dropdown__name').textContent).toContain('Khách Ellora');
      click('#dropdown-' + suffix); await settle();
      expect(router.url).toBe(destination);
      expect(fixture.nativeElement.querySelector('#header-dropdown-menu')).toBeNull();
    }
    for (const [suffix, destination] of destinations) {
      click('#mobile-menu-btn');
      expect(element<HTMLAnchorElement>('#mobile-' + suffix).getAttribute('href')).toBe(destination);
      expect(element('#mobile-rewards').tagName).toBe('BUTTON');
      click('#mobile-' + suffix); await settle();
      expect(router.url).toBe(destination);
      expect(fixture.nativeElement.querySelector('#mobile-menu-panel')).toBeNull();
    }
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    expect(getUserProfile).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain('Cognito spoof');
  });

  it('does not elevate an unknown or differently cased canonical role to ADMIN or CUSTOMER', async () => {
    getCurrentUser.mockResolvedValue({ ...profile(), role: 'admin' as Profile['role'] });
    await mount('/admin/dashboard');
    click('#header-avatar-btn');
    expect(controlIds('#header-dropdown-menu')).toEqual(['dropdown-logout']);
    click('#mobile-menu-btn');
    expectNoAccountDestinations();
    expect(element('#mobile-logout')).not.toBeNull();
    expect(element<HTMLAnchorElement>('#header-logo').getAttribute('href')).toBe('/');
  });

  it('offers a logout fallback when the canonical profile fails without showing customer account links', async () => {
    getCurrentUser.mockRejectedValue(new Error('Profile unavailable'));
    const header = await mount();
    expect(header.isAuthChecking).toBe(false);
    click('#header-avatar-btn');
    expect(controlIds('#header-dropdown-menu')).toEqual(['dropdown-logout']);
    expect(element('.header-dropdown__name').textContent).toContain('Tài khoản');
    click('#mobile-menu-btn');
    expectNoAccountDestinations();
    click('#mobile-logout'); await settle();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(router.url).toBe('/login');
  });

  it('does not read any profile for an anonymous visitor', async () => {
    isAuthenticated.mockResolvedValue(false);
    await mount();
    expect(element('a[href="/login"]')).not.toBeNull();
    click('#mobile-menu-btn');
    expect(element('#mobile-menu-panel a[href="/login"]')).not.toBeNull();
    expectNoAccountDestinations();
    expect(fixture.nativeElement.querySelector('#header-avatar-btn, #mobile-logout')).toBeNull();
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(getUserProfile).not.toHaveBeenCalled();
  });

  it('does not check auth or read a profile while rendering on the server', async () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const header = await mount();
    expect(header.isAuthChecking).toBe(false);
    expect(header.isLoggedIn).toBe(false);
    expect(element<HTMLAnchorElement>('#header-logo').getAttribute('href')).toBe('/');
    expect(isAuthenticated).not.toHaveBeenCalled();
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(getUserProfile).not.toHaveBeenCalled();
  });

  it('waits for the canonical profile before rendering an account menu and falls back to its email', async () => {
    const pending = deferred<Profile>(); getCurrentUser.mockReturnValue(pending.promise);
    const header = await mount('/salon/1', false);
    await Promise.resolve(); fixture.detectChanges();
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    expect(header.isAuthChecking).toBe(true);
    expect(fixture.nativeElement.querySelector('#header-avatar-btn, #header-dashboard')).toBeNull();
    click('#mobile-menu-btn');
    expectNoAccountDestinations();
    expect(fixture.nativeElement.querySelector('#mobile-logout')).toBeNull();
    pending.resolve({ ...profile(), fullName: '   ', email: 'canonical@ellora.test' });
    await pending.promise; await settle();
    expect(element('#mobile-dashboard')).not.toBeNull();
    expect(element('.mobile-menu-username').textContent).toContain('canonical@ellora.test');
    expect(header.userInitial).toBe('C');
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('clears role, name and open panels immediately on a real logout click before navigating to login', async () => {
    const signingOut = deferred<void>(); logout.mockReturnValue(signingOut.promise);
    const header = await mount();
    click('.header-search-trigger');
    click('#header-avatar-btn');
    click('#dropdown-logout');
    expect(logout).toHaveBeenCalledTimes(1);
    expect(header.isLoggedIn).toBe(false);
    expect(header.userRole).toBeNull();
    expect(header.userName).toBe('');
    expect(header.userInitial).toBe('');
    expect(header.isSearchActive).toBe(false);
    expect(fixture.nativeElement.querySelector('#header-dropdown-menu, #mobile-menu-panel, #header-search-panel')).toBeNull();
    expect(router.url).toBe('/salon/1');
    signingOut.resolve(); await signingOut.promise; await settle();
    expect(router.url).toBe('/login');
    expectNoAccountDestinations();
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('ignores late authentication after logout or destruction without starting a profile read', async () => {
    const signedOutAuth = deferred<boolean>(); isAuthenticated.mockReturnValueOnce(signedOutAuth.promise);
    const signedOut = await mount('/salon/1', false);
    await signedOut.logout();
    signedOutAuth.resolve(true); await signedOutAuth.promise; await settle();
    expect(signedOut.isLoggedIn).toBe(false);
    expect(signedOut.userRole).toBeNull();
    expect(router.url).toBe('/login');
    fixture.destroy();

    const destroyedAuth = deferred<boolean>(); isAuthenticated.mockReturnValueOnce(destroyedAuth.promise);
    const destroyed = await mount('/salon/1', false);
    fixture.destroy();
    destroyedAuth.resolve(true); await destroyedAuth.promise; await Promise.resolve();
    expect(destroyed.isLoggedIn).toBe(false);
    expect(destroyed.userRole).toBeNull();
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it('ignores a late ADMIN profile after logout or destruction so it cannot restore the admin menu', async () => {
    const signedOutProfile = deferred<Profile>(); getCurrentUser.mockReturnValueOnce(signedOutProfile.promise);
    const signedOut = await mount('/salon/1', false);
    await Promise.resolve();
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    await signedOut.logout();
    signedOutProfile.resolve(profile()); await signedOutProfile.promise; await settle();
    expect(signedOut.isLoggedIn).toBe(false);
    expect(signedOut.userRole).toBeNull();
    expect(signedOut.userName).toBe('');
    expectNoAccountDestinations();
    fixture.destroy();

    const destroyedProfile = deferred<Profile>(); getCurrentUser.mockReturnValueOnce(destroyedProfile.promise);
    const destroyed = await mount('/salon/1', false);
    await Promise.resolve();
    expect(getCurrentUser).toHaveBeenCalledTimes(2);
    fixture.destroy();
    destroyedProfile.resolve(profile()); await destroyedProfile.promise; await Promise.resolve();
    expect(destroyed.userRole).toBeNull();
    expect(destroyed.userName).toBe('');
    expect(destroyed.isAdmin).toBe(false);
  });
});
