import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { SalonDetails } from './salon-details.component';
import { SalonApiService } from '../../services/salon-api.service';
import { Salon } from '../../models/ellora.model';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('Progressive salon loading', () => {
  const api = { detail: vi.fn(), services: vi.fn(), reviews: vi.fn(), search: vi.fn(), searchFiltered: vi.fn(), workingHours: vi.fn() };
  let component: SalonDetails;
  beforeEach(() => {
    vi.resetAllMocks();
    api.detail.mockImplementation(async (id: string) => ({ id, name: 'Salon ' + id }));
    api.services.mockResolvedValue([]); api.reviews.mockResolvedValue({ content: [] });
    api.search.mockResolvedValue({ content: [] }); api.searchFiltered.mockResolvedValue({ content: [] }); api.workingHours.mockResolvedValue([]);
    TestBed.configureTestingModule({ providers: [
      { provide: SalonApiService, useValue: api }, { provide: ActivatedRoute, useValue: {} },
    ] });
    component = TestBed.runInInjectionContext(() => new SalonDetails());
  });
  afterEach(() => { component.ngOnDestroy(); TestBed.resetTestingModule(); });
  const load = (id: string) => (component as unknown as { load(id: string): Promise<void> }).load(id);

  it('shows salon and services while reviews are still pending', async () => {
    const reviews = deferred<{ content: [] }>(); api.reviews.mockReturnValue(reviews.promise);
    api.services.mockResolvedValue([{ id: 'gel', name: 'Sơn gel' }]);
    const loading = load('1');
    await Promise.resolve(); await Promise.resolve();
    expect(component.salon()?.id).toBe('1');
    expect(component.services()[0].name).toBe('Sơn gel');
    expect(component.error()).toBe('');
    reviews.resolve({ content: [] }); await loading;
  });

  it('retains loaded content and reports a secondary request failure', async () => {
    api.reviews.mockRejectedValue(new Error('offline'));
    await load('1');
    expect(component.salon()?.id).toBe('1');
    expect(component.error()).not.toBe('');
  });

  it('ignores late responses from an older salon', async () => {
    const older = deferred<Salon>();
    api.detail.mockImplementation((id: string) => id === '1' ? older.promise : Promise.resolve({ id }));
    const first = load('1'); await load('2');
    older.resolve({ id: '1' } as Salon); await first;
    expect(component.salon()?.id).toBe('2');
  });

  it('ignores pending responses after leaving the page', async () => {
    const pending = deferred<Salon>(); api.detail.mockReturnValue(pending.promise);
    const loading = load('1'); component.ngOnDestroy();
    pending.resolve({ id: '1' } as Salon); await loading;
    expect(component.salon()).toBeNull();
  });

  it('uses the complete salon address and safely encodes it for directions when no pin exists', () => {
    component.salon.set({ id: '1', name: 'Tiệm Hoa', description: '', address: ' 22/3 đường Hoa & số 5 ',
      district: ' Quận 9 ', city: ' Hồ Chí Minh ', coordinates: null, rating: 5, reviewCount: 2, images: [] });
    expect(component.fullAddress()).toBe('22/3 đường Hoa & số 5, Quận 9, Hồ Chí Minh');
    expect(component.locationArea()).toBe('Quận 9, Hồ Chí Minh');
    const url = new URL(component.directionsUrl()!);
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('destination')).toBe(component.fullAddress());
  });

  it('prefers approved zero coordinates and updates directions when a different salon is displayed', () => {
    const salon: Salon = { id: '1', name: 'Tiệm Hoa', description: '', address: 'Địa chỉ cũ',
      city: 'Hồ Chí Minh', coordinates: { lat: 0, lng: 0 }, rating: 5, reviewCount: 2, images: [] };
    component.salon.set(salon);
    expect(new URL(component.directionsUrl()!).searchParams.get('destination')).toBe('0,0');
    component.salon.set({ ...salon, id: '2', address: 'Địa chỉ mới', city: 'Đà Nẵng', coordinates: { lat: 16.05, lng: 108.2 } });
    expect(new URL(component.directionsUrl()!).searchParams.get('destination')).toBe('16.05,108.2');
    expect(component.fullAddress()).toBe('Địa chỉ mới, Đà Nẵng');
  });

  it('does not invent a destination when the salon has no location data', () => {
    component.salon.set({ id: '1', name: 'Tiệm Hoa', description: '', address: ' ', city: '', district: null,
      coordinates: null, rating: 0, reviewCount: 0, images: [] });
    expect(component.fullAddress()).toBe(''); expect(component.locationArea()).toBe('');
    expect(component.directionsUrl()).toBeNull();
    component.salon.set(null); expect(component.directionsUrl()).toBeNull();
  });

  it('finds neighboring salons around the approved salon pin, including a genuine zero, rather than the customer position', async () => {
    api.detail.mockResolvedValue({ id:'1', coordinates:{ lat:0,lng:0 } });
    api.searchFiltered.mockResolvedValue({ content:[{ id:'1' },{ id:'2',distance:1.5 }] });
    await load('1');
    expect(api.searchFiltered).toHaveBeenCalledWith({ latitude:0,longitude:0,radiusKm:10,sort:'distance' },0,5);
    expect(api.search).not.toHaveBeenCalled(); expect(component.nearbySalons().map(salon=>salon.id)).toEqual(['2']);
  });
});
