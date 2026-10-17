import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SalonDetails } from './salon-details.component';
import { PublicSalonMapComponent } from './public-salon-map.component';
import { SalonApiService } from '../../services/salon-api.service';
import { LeafletMapService } from '../../services/leaflet-map.service';
import { Salon } from '../../models/ellora.model';

@Component({ standalone: true, template: '<p>Trang đặt lịch</p>' })
class BookingDestination {}

describe('Public salon location and booking card integration', () => {
  const api = { detail: vi.fn(), services: vi.fn(), reviews: vi.fn(), search: vi.fn(), searchFiltered: vi.fn(), workingHours: vi.fn() };
  const loader = { load: vi.fn() };
  const first: Salon = { id: '1', name: 'Tiệm Ellora', description: 'Chăm sóc móng', address: ' 12 Lê Lợi ', district: ' Quận 1 ', city: ' Hồ Chí Minh ', coordinates: null, images: [], rating: 4.5, reviewCount: 8 };
  const second: Salon = { ...first, id: '2', address: '34 Nguyễn Huệ', district: 'Quận 3', city: 'Đà Nẵng' };
  let salons: Record<string, Salon>;

  beforeEach(() => {
    vi.resetAllMocks(); salons = { '1': { ...first }, '2': { ...second } };
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
    api.detail.mockImplementation(async (id: string) => salons[id]);
    api.services.mockResolvedValue([{ id: '7', salonId: '1', name: 'Sơn gel', description: '', price: 150000, durationMinutes: 60 }]);
    api.reviews.mockResolvedValue({ content: [] }); api.search.mockResolvedValue({ content: [] }); api.searchFiltered.mockResolvedValue({ content: [] });
    api.workingHours.mockResolvedValue([{ dayOfWeek: 'MONDAY', openTime: '09:00:00', closeTime: '19:00:00', closed: false }, { dayOfWeek: 'SUNDAY', openTime: null, closeTime: null, closed: true }]);
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'salon/:id', component: SalonDetails }, { path: 'booking', component: BookingDestination }]),
      { provide: SalonApiService, useValue: api }, { provide: LeafletMapService, useValue: loader }
    ] });
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  const settle = async (harness: RouterTestingHarness) => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
    await harness.fixture.whenStable(); harness.detectChanges();
  };
  const render = async () => {
    const harness = await RouterTestingHarness.create('/salon/1'); await settle(harness); return harness;
  };
  const addresses = (root: HTMLElement) => ['.location-card__address', '.booking-widget__address p']
    .map(selector => root.querySelector(selector)?.textContent?.trim());
  const directions = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLAnchorElement>('.location-card__directions, .booking-widget__address a'));

  it('shows the same real address and Vietnamese directions in both blocks without inventing a missing map', async () => {
    const harness = await render(); const root = harness.routeNativeElement!;
    expect(addresses(root)).toEqual(['12 Lê Lợi, Quận 1, Hồ Chí Minh', '12 Lê Lợi, Quận 1, Hồ Chí Minh']);
    expect(root.querySelector('.location-card__area')?.textContent?.trim()).toBe('Quận 1, Hồ Chí Minh');
    expect(directions(root)).toHaveLength(2);
    for (const link of directions(root)) {
      expect(link.textContent?.trim()).toBe('Nhận chỉ đường');
      expect(link.getAttribute('href')).toBe('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent('12 Lê Lợi, Quận 1, Hồ Chí Minh'));
      expect(link.target).toBe('_blank'); expect(link.rel).toContain('noopener');
    }
    expect(root.querySelector('app-public-salon-map')).toBeNull(); expect(loader.load).not.toHaveBeenCalled();
    for (const hardcode of ['SoHo', 'New York', 'SPA VIỆT', 'Get directions']) expect(root.textContent).not.toContain(hardcode);
  });

  it('keeps a genuine zero pin read-only and preserves working hours and selected-service booking parameters', async () => {
    salons['1'] = { ...salons['1'], coordinates: { lat: 0, lng: 0 } };
    const harness = await render(); const root = harness.routeNativeElement!;
    const map = harness.routeDebugElement!.query(By.directive(PublicSalonMapComponent)).componentInstance as PublicSalonMapComponent;
    expect(map.coordinates()).toEqual({ lat: 0, lng: 0 }); expect(loader.load).not.toHaveBeenCalled();
    expect(directions(root).map(link => link.getAttribute('href'))).toEqual(Array(2).fill('https://www.google.com/maps/dir/?api=1&destination=0%2C0'));
    root.querySelector<HTMLButtonElement>('app-service-card button')!.click(); harness.detectChanges();
    expect(root.querySelector('.booking-widget__selected-service')?.textContent).toContain('Sơn gel');
    const hours = root.querySelector<HTMLDetailsElement>('.booking-widget__hours')!;
    hours.querySelector<HTMLElement>('summary')!.click(); expect(hours.open).toBe(true);
    expect(hours.textContent).toContain('09:00–19:00'); expect(hours.textContent).toContain('Nghỉ');
    root.querySelector<HTMLAnchorElement>('.booking-widget__cta')!.click(); await settle(harness);
    expect(TestBed.inject(Router).url).toBe('/booking?salonId=1&serviceId=7');
  });

  it('shows an honest missing address in both blocks and omits unavailable directions', async () => {
    salons['1'] = { ...salons['1'], address: '', district: null, city: '', coordinates: null };
    const harness = await render(); const root = harness.routeNativeElement!;
    expect(addresses(root)).toEqual(['Salon chưa cập nhật địa chỉ.', 'Salon chưa cập nhật địa chỉ.']);
    expect(directions(root)).toHaveLength(0); expect(root.querySelector('app-public-salon-map')).toBeNull();
    expect(root.querySelector('.booking-widget__cta')).not.toBeNull();
  });

  it('replaces both location blocks and clears the previous map/service when navigating between salon IDs', async () => {
    salons['1'] = { ...salons['1'], coordinates: { lat: 0, lng: 0 } };
    const harness = await render();
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('app-service-card button')!.click(); harness.detectChanges();
    await harness.navigateByUrl('/salon/2'); await settle(harness); const root = harness.routeNativeElement!;
    expect(addresses(root)).toEqual(['34 Nguyễn Huệ, Quận 3, Đà Nẵng', '34 Nguyễn Huệ, Quận 3, Đà Nẵng']);
    for (const link of directions(root)) expect(link.href).toContain(encodeURIComponent('34 Nguyễn Huệ, Quận 3, Đà Nẵng'));
    expect(root.querySelector('app-public-salon-map')).toBeNull();
    expect(root.querySelector('.booking-widget__selected-service')).toBeNull();
    expect(root.querySelector('.booking-widget__cta')?.getAttribute('href')).toBe('/booking?salonId=2');
  });
});
