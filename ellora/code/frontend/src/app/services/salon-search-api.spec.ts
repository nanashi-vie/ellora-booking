import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apiConfig } from '../config/api.config';
import { SalonApiService } from './salon-api.service';

describe('Filtered public salon API', () => {
  let api: SalonApiService;
  let http: HttpTestingController;
  const endpoint = apiConfig.baseUrl + '/customer/salons';
  const page = (content: unknown[] = []) => ({ data: { content, pageNumber: 0, last: true, totalElements: content.length } });
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(SalonApiService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('sends all supported filters and pagination as encoded first-party query parameters', async () => {
    const pending = api.searchFiltered({ keyword: 'Sơn gel & móng', location: 'Quận 1', date: '2026-10-19', time: '15:07', sort: 'rating' }, 3, 8);
    const request = http.expectOne(req => req.url === endpoint);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.getAll('keyword')).toEqual(['Sơn gel & móng']);
    expect(request.request.params.get('location')).toBe('Quận 1'); expect(request.request.params.get('date')).toBe('2026-10-19');
    expect(request.request.params.get('time')).toBe('15:07'); expect(request.request.params.get('sort')).toBe('rating');
    expect(request.request.params.get('page')).toBe('3'); expect(request.request.params.get('size')).toBe('8');
    expect(request.request.transferCache).toBe(true);
    request.flush(page()); expect((await pending).content).toEqual([]);
  });

  it('opts device-centered responses out of SSR transfer caching, including a zero center', async () => {
    const pending = api.searchFiltered({ latitude: 0, longitude: 0, radiusKm: 5, sort: 'distance' });
    const request = http.expectOne(req => req.url === endpoint);
    expect(request.request.params.get('latitude')).toBe('0'); expect(request.request.params.get('longitude')).toBe('0');
    expect(request.request.params.get('radiusKm')).toBe('5'); expect(request.request.transferCache).toBe(false);
    request.flush(page()); await pending;
  });

  it('does not transfer-cache even an incomplete geolocated request', async () => {
    const pending = api.searchFiltered({ latitude: 0 });
    const request = http.expectOne(req => req.url === endpoint);
    expect(request.request.transferCache).toBe(false); request.flush(page()); await pending;
  });

  it('omits blank optional filters and never adds an implicit device center or radius', async () => {
    const pending = api.searchFiltered({ keyword: '', location: '', date: '', time: '' });
    const request = http.expectOne(req => req.url === endpoint);
    expect(request.request.params.keys().sort()).toEqual(['page', 'size']);
    request.flush(page()); await pending;
  });

  it('maps genuine approved points and zero distances without inventing missing distances or pins', async () => {
    const pending = api.searchFiltered({ latitude: 0, longitude: 0, sort: 'distance' });
    http.expectOne(req => req.url === endpoint).flush(page([
      { id: 1, name: 'Tiệm trùng vị trí', address: 'A', city: 'HCM', district: 'Quận 1', latitude: 0, longitude: 0, distanceKm: 0 },
      { id: 2, name: 'Tiệm gần', address: 'B', city: 'HCM', latitude: 10.77, longitude: 106.7, distanceKm: 2.5 },
      { id: 3, name: 'Không có pin', address: 'C', city: 'HCM', distanceKm: 1 },
      { id: 4, name: 'Pin có khoảng cách sai', address: 'D', city: 'HCM', latitude: 10.77, longitude: 106.7, distanceKm: -1 },
    ]));
    const salons = (await pending).content;
    expect(salons[0]).toMatchObject({ coordinates: { lat: 0, lng: 0 }, distance: 0, district: 'Quận 1' });
    expect(salons[1].distance).toBe(2.5); expect(salons[2].coordinates).toBeNull(); expect(salons[2].distance).toBeUndefined();
    expect(salons[3].distance).toBeUndefined();
  });
});
