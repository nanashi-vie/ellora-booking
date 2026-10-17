import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Salon } from '../../../models/ellora.model';
import { MockDataService } from '../../../services/mock-data.service';
import { PublicSalonSearchService } from '../../../services/public-salon-search.service';
import { SalonApiService } from '../../../services/salon-api.service';
import { Home } from './home.component';

describe('Home discovery and nearby salons', () => {
  let fixture: ComponentFixture<Home>;
  let state: PublicSalonSearchService;
  const api = { search: vi.fn(), searchFiltered: vi.fn() };
  const salon = (id: string): Salon => ({ id, name: 'Tiệm ' + id, address: 'Đường mẫu', city: 'Hồ Chí Minh', description: '', rating: 4.5, reviewCount: 2, images: [], coordinates: null });
  const page = (id: string) => ({ content: [salon(id)], totalElements: 1, totalPages: 1, number: 0, size: 12, first: true, last: true });
  const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
  const render = async () => { fixture = TestBed.createComponent(Home); fixture.detectChanges(); await settle(); return fixture.componentInstance; };
  const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); fixture?.detectChanges(); };
  beforeEach(() => {
    vi.resetAllMocks(); api.search.mockResolvedValue(page('general'));
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    api.searchFiltered.mockImplementation((options: { sort?: string }) => Promise.resolve(page(options.sort === 'rating' ? 'top' : 'near')));
    TestBed.configureTestingModule({ imports: [Home], providers: [provideRouter([]),
      { provide: SalonApiService, useValue: api }, { provide: MockDataService, useValue: { categories: [] } }
    ] });
    state = TestBed.inject(PublicSalonSearchService);
  });
  afterEach(() => { fixture?.destroy(); TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  it('renders an explicit location invitation and real independent general/rating lists without requesting GPS', async () => {
    const locate = vi.spyOn(state, 'requestLocation'); const component = await render();
    expect(locate).not.toHaveBeenCalled(); expect(api.searchFiltered).toHaveBeenCalledExactlyOnceWith({ sort: 'rating' }, 0, 5);
    expect(component.salons()[0].id).toBe('general'); expect(component.topSalons()[0].id).toBe('top'); expect(component.nearbySalons()).toEqual([]);
    expect(fixture.nativeElement.querySelector('app-salon-search-form input[type=date]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.home-nearby').textContent).toContain('bán kính 5 km');
    expect(fixture.nativeElement.textContent).toContain('Khám phá salon');
  });

  it('loads nearby data only after an explicit grant and keeps coordinates out of view-all links', async () => {
    await render(); vi.spyOn(state, 'requestLocation').mockImplementation(async () => { state.coordinates.set({ lat: 0, lng: 106.7 }); return true; });
    (fixture.nativeElement.querySelector('.home-nearby button') as HTMLButtonElement).click(); await settle(); await fixture.whenStable(); fixture.detectChanges();
    expect(api.searchFiltered).toHaveBeenLastCalledWith({ keyword: '', location: '', date: '', time: '', sort: 'distance', latitude: 0, longitude: 106.7, radiusKm: 5 }, 0, 8);
    expect(fixture.componentInstance.nearbySalons()[0].id).toBe('near');
    const link = fixture.nativeElement.querySelector('.home-nearby a[href*="nearby"]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toContain('nearby=1'); expect(link.getAttribute('href')).toContain('radiusKm=5');
    expect(link.getAttribute('href')).not.toMatch(/latitude|longitude|106/);
  });

  it('keeps discoverable salons available when location or the rating request fails', async () => {
    api.searchFiltered.mockRejectedValue(new Error('rating failed')); await render();
    vi.spyOn(state, 'requestLocation').mockImplementation(async () => { state.error.set('Bạn chưa cho phép định vị.'); return false; });
    (fixture.nativeElement.querySelector('.home-nearby button') as HTMLButtonElement).click(); await settle();
    expect(fixture.componentInstance.salons()[0].id).toBe('general'); expect(fixture.componentInstance.salonError()).toBe('');
    expect(fixture.nativeElement.querySelector('.home-nearby').textContent).toContain('Bạn chưa cho phép định vị.');
    expect(fixture.nativeElement.textContent).toContain('Không tải được salon được đánh giá cao');
    expect(api.searchFiltered).toHaveBeenCalledOnce();
  });

  it('ignores an old nearby response after coordinates change or clear, and after destruction', async () => {
    const first = deferred<ReturnType<typeof page>>(), second = deferred<ReturnType<typeof page>>(), third = deferred<ReturnType<typeof page>>();
    await render(); api.searchFiltered.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
    state.coordinates.set({ lat: 10, lng: 106 }); fixture.detectChanges();
    state.coordinates.set({ lat: 11, lng: 107 }); fixture.detectChanges(); second.resolve(page('current')); await settle();
    first.resolve(page('stale')); await settle(); expect(fixture.componentInstance.nearbySalons()[0].id).toBe('current');
    state.coordinates.set({ lat: 12, lng: 108 }); fixture.detectChanges(); state.clearLocation(); fixture.detectChanges();
    expect(fixture.componentInstance.nearbySalons()).toEqual([]); fixture.destroy(); third.resolve(page('destroyed')); await Promise.resolve();
    expect(fixture.componentInstance.nearbySalons()).toEqual([]);
  });
});
