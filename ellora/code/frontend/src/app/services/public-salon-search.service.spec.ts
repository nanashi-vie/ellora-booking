import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, convertToParamMap } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SEARCH_FILTERS, PublicSalonSearchService } from './public-salon-search.service';

describe('Public salon search state and device location', () => {
  const router = { navigate: vi.fn(), createUrlTree: vi.fn(), isActive: vi.fn() };
  const getCurrentPosition = vi.fn();
  let service: PublicSalonSearchService;
  let originalGeolocation: PropertyDescriptor | undefined;
  let success: PositionCallback;
  let failure: PositionErrorCallback;

  beforeEach(() => {
    vi.resetAllMocks();
    originalGeolocation = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
    getCurrentPosition.mockImplementation((onSuccess: PositionCallback, onFailure: PositionErrorCallback) => {
      success = onSuccess; failure = onFailure;
    });
    router.navigate.mockResolvedValue(true);
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }] });
    service = TestBed.inject(PublicSalonSearchService);
  });
  afterEach(() => {
    if (originalGeolocation) Object.defineProperty(navigator, 'geolocation', originalGeolocation);
    else Reflect.deleteProperty(navigator, 'geolocation');
    vi.useRealTimers(); vi.restoreAllMocks(); TestBed.resetTestingModule();
  });

  const position = (latitude = 10.77, longitude = 106.7, accuracy = 30) => ({
    coords: { latitude, longitude, accuracy }, timestamp: Date.now(),
  } as GeolocationPosition);

  it('starts with normal filters and never asks for location while constructing or parsing a URL', () => {
    expect(service.coordinates()).toBeNull(); expect(service.filters()).toEqual(DEFAULT_SEARCH_FILTERS);
    const filters = service.fromParams(convertToParamMap({ keyword: 'Sơn gel', location: 'Quận 1', date: '2026-10-19', time: '15:07', sort: 'rating', latitude: '1', longitude: '2' }));
    expect(filters).toMatchObject({ keyword: 'Sơn gel', location: 'Quận 1', date: '2026-10-19', time: '15:07', sort: 'rating', nearby: false });
    expect(service.coordinates()).toBeNull(); expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('restores nearby intent without treating URL coordinates as permission or a saved location', () => {
    const filters = service.fromParams(convertToParamMap({ nearby: '1', sort: 'distance', radiusKm: '10', location: 'Old area', latitude: '10.77', longitude: '106.7' }));
    expect(filters).toMatchObject({ nearby: true, sort: 'distance', radiusKm: 10, location: '' });
    expect(service.coordinates()).toBeNull();
    expect(() => service.apiOptions(filters)).toThrow('vị trí');
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(service.fromParams(convertToParamMap({ radiusKm: 'NaN', sort: 'unknown' }))).toMatchObject({ radiusKm: 5, sort: 'newest' });
  });

  it('puts only non-sensitive filters in navigation and never writes device coordinates to storage', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    service.coordinates.set({ lat: 0, lng: 106.7 });
    await service.navigate({ ...DEFAULT_SEARCH_FILTERS, keyword: ' Sơn gel ', location: 'Ignored area', nearby: true, sort: 'distance', radiusKm: 10 }, 2);
    expect(router.navigate).toHaveBeenCalledWith(['/search'], { queryParams: {
      keyword: 'Sơn gel', location: undefined, date: undefined, time: undefined,
      nearby: '1', radiusKm: 10, sort: 'distance', page: 2,
    } });
    const serialized = JSON.stringify(router.navigate.mock.calls[0]);
    for (const secret of ['latitude', 'longitude', '106.7', 'accuracy']) expect(serialized).not.toContain(secret);
    expect(storage).not.toHaveBeenCalled();
    expect(service.coordinates()).toEqual({ lat: 0, lng: 106.7 });
  });

  it('uses the session center only for first-party API options and preserves genuine zero coordinates', () => {
    const normal = service.apiOptions({ ...DEFAULT_SEARCH_FILTERS, keyword: 'Nail', location: 'Quận 1' });
    expect(normal).toMatchObject({ keyword: 'Nail', location: 'Quận 1', sort: 'newest' });
    expect(normal).not.toHaveProperty('latitude'); expect(normal).not.toHaveProperty('radiusKm');
    service.coordinates.set({ lat: 0, lng: 0, accuracy: 20 });
    const nearby = service.apiOptions({ ...DEFAULT_SEARCH_FILTERS, nearby: true, sort: 'distance' });
    expect(nearby).toMatchObject({ latitude: 0, longitude: 0, radiusKm: 5, sort: 'distance' });
    expect(nearby).not.toHaveProperty('accuracy');
  });

  it('treats an ignored navigation to the exact current search URL as a successful submission', async () => {
    const tree = { route: 'same-search' };
    router.navigate.mockResolvedValueOnce(false); router.createUrlTree.mockReturnValueOnce(tree); router.isActive.mockReturnValueOnce(true);
    expect(await service.navigate({ ...DEFAULT_SEARCH_FILTERS, keyword: 'Nail', location: 'Quận 1' })).toBe(true);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/search'], { queryParams: expect.objectContaining({ keyword: 'Nail', location: 'Quận 1', page: undefined }) });
    expect(router.isActive).toHaveBeenCalledWith(tree, { paths: 'exact', queryParams: 'exact', fragment: 'ignored', matrixParams: 'ignored' });
  });

  it('does not report success when navigation was canceled and the target URL is not active', async () => {
    const tree = { route: 'different-search' };
    router.navigate.mockResolvedValueOnce(false); router.createUrlTree.mockReturnValueOnce(tree); router.isActive.mockReturnValueOnce(false);
    expect(await service.navigate({ ...DEFAULT_SEARCH_FILTERS, keyword: 'Different' })).toBe(false);
    expect(router.isActive).toHaveBeenCalledWith(tree, expect.objectContaining({ paths: 'exact', queryParams: 'exact' }));
  });

  it('makes one explicit bounded location request and shares it across duplicate clicks', async () => {
    const first = service.requestLocation();
    expect(service.locating()).toBe(true); expect(service.requestLocation()).toBe(first);
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
    success(position());
    expect(await first).toBe(true); expect(service.locating()).toBe(false);
    expect(service.coordinates()).toEqual({ lat: 10.77, lng: 106.7, accuracy: 30 });
    expect(service.error()).toBe('');
  });

  it('keeps manual area search usable after permission is denied', async () => {
    const pending = service.requestLocation();
    failure({ code: 1 } as GeolocationPositionError);
    expect(await pending).toBe(false); expect(service.coordinates()).toBeNull();
    expect(service.error()).toContain('chưa cho phép'); expect(service.locating()).toBe(false);
    await service.navigate({ ...DEFAULT_SEARCH_FILTERS, location: ' Quận 7 ' });
    expect(service.filters().location).toBe('Quận 7'); expect(service.error()).toBe('');
    expect(router.navigate.mock.calls[0][1].queryParams.location).toBe('Quận 7');
  });

  it('does not restore a stale device center after the user switches to a manual area', async () => {
    const pending = service.requestLocation();
    await service.navigate({ ...DEFAULT_SEARCH_FILTERS, location: 'Quận 1', sort: 'distance' });
    success(position());
    expect(await pending).toBe(false); expect(service.coordinates()).toBeNull(); expect(service.locating()).toBe(false);
    expect(service.filters()).toMatchObject({ location: 'Quận 1', nearby: false, sort: 'newest' });
  });

  it('rejects invalid device coordinates rather than adding a fabricated center', async () => {
    const pending = service.requestLocation(); success(position(91, 106.7));
    expect(await pending).toBe(false); expect(service.coordinates()).toBeNull(); expect(service.error()).toContain('khu vực');
  });

  it('settles a silent geolocation provider after its watchdog and ignores a later success', async () => {
    vi.useFakeTimers();
    const pending = service.requestLocation(); await vi.advanceTimersByTimeAsync(12000);
    expect(await pending).toBe(false); expect(service.locating()).toBe(false); expect(service.error()).toContain('quá lâu');
    success(position()); expect(service.coordinates()).toBeNull();
  });

  it('handles unavailable providers and synchronous browser errors without starting an endless request', async () => {
    getCurrentPosition.mockImplementationOnce(() => { throw new Error('blocked'); });
    expect(await service.requestLocation()).toBe(false); expect(service.locating()).toBe(false); expect(service.error()).toContain('khu vực');
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
    expect(await service.requestLocation()).toBe(false); expect(service.error()).toContain('nhập khu vực');
  });

  it('never requests device location while running on the server', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }, { provide: PLATFORM_ID, useValue: 'server' }] });
    const server = TestBed.inject(PublicSalonSearchService);
    expect(await server.requestLocation()).toBe(false); expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(server.coordinates()).toBeNull(); expect(server.locating()).toBe(false);
  });
});
