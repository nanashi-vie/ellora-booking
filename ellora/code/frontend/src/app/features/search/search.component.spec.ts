import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Salon } from '../../models/ellora.model';
import { DEFAULT_SEARCH_FILTERS, PublicSalonSearchService } from '../../services/public-salon-search.service';
import { SalonApiService } from '../../services/salon-api.service';
import { Search } from './search.component';

describe('Public salon search results', () => {
  let fixture: ComponentFixture<Search> | undefined;
  let state: PublicSalonSearchService;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const api = { searchFiltered: vi.fn() };
  const router = { navigate: vi.fn() };
  const salon = (id: string) => ({ id, name: 'Tiệm ' + id, coordinates: null } as Salon);
  const result = (id: string, totalElements = 1, last = true) => ({ content: [salon(id)], totalElements, last });
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  };
  const render = () => {
    fixture = TestBed.createComponent(Search);
    fixture.detectChanges();
    return fixture.componentInstance;
  };
  const settle = async () => {
    await Promise.resolve(); await Promise.resolve();
    fixture!.detectChanges();
  };

  beforeEach(() => {
    vi.resetAllMocks();
    params = new BehaviorSubject(convertToParamMap({}));
    api.searchFiltered.mockResolvedValue(result('initial'));
    router.navigate.mockResolvedValue(true);
    TestBed.configureTestingModule({
      imports: [Search], providers: [
        { provide: SalonApiService, useValue: api }, { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { queryParamMap: params.asObservable() } }
      ]
    });
    // Exercise the real route/state/API coordination; the shared form and map have their own DOM tests.
    TestBed.overrideComponent(Search, { set: { template: '', imports: [] } });
    state = TestBed.inject(PublicSalonSearchService);
  });
  afterEach(() => { fixture?.destroy(); fixture = undefined; params.complete(); TestBed.resetTestingModule(); });

  it('restores all shareable filters and the requested page before fetching results', async () => {
    params.next(convertToParamMap({ keyword: 'Sơn gel', location: 'Quận 1', date: '2026-10-19', time: '15:07', sort: 'rating', page: '2' }));
    api.searchFiltered.mockResolvedValueOnce(result('filtered', 38, false));
    const component = render();
    await settle();
    expect(api.searchFiltered).toHaveBeenCalledOnce();
    expect(api.searchFiltered).toHaveBeenCalledWith({ keyword: 'Sơn gel', location: 'Quận 1', date: '2026-10-19', time: '15:07', sort: 'rating' }, 2);
    expect(component.filters()).toMatchObject({ keyword: 'Sơn gel', location: 'Quận 1', sort: 'rating' });
    expect(component.page()).toBe(2); expect(component.total()).toBe(38); expect(component.last()).toBe(false);
    expect(component.salons()[0].id).toBe('filtered'); expect(component.loading()).toBe(false);
  });

  it('ignores an older successful response after the user changes filters and resets the page', async () => {
    const first = deferred<ReturnType<typeof result>>(), second = deferred<ReturnType<typeof result>>();
    api.searchFiltered.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    params.next(convertToParamMap({ keyword: 'Old', page: '3' }));
    const component = render();
    params.next(convertToParamMap({ keyword: 'New', location: 'Quận 7' })); fixture!.detectChanges();
    expect(component.page()).toBe(0); expect(component.loading()).toBe(true); expect(component.salons()).toEqual([]);
    second.resolve(result('new', 18, false)); await settle();
    first.resolve(result('stale', 90, false)); await settle();
    expect(component.salons().map(value => value.id)).toEqual(['new']); expect(component.total()).toBe(18);
    expect(api.searchFiltered.mock.calls[1]).toEqual([{ keyword: 'New', location: 'Quận 7', date: '', time: '', sort: 'newest' }, 0]);
    expect(component.error()).toBe(''); expect(component.loading()).toBe(false);
  });

  it('does not replace current results with an error from an earlier request', async () => {
    const first = deferred<ReturnType<typeof result>>();
    api.searchFiltered.mockReturnValueOnce(first.promise).mockResolvedValueOnce(result('current'));
    const component = render();
    params.next(convertToParamMap({ keyword: 'Current' })); fixture!.detectChanges(); await settle();
    first.reject({ error: { message: 'Old failure' } }); await settle();
    expect(component.salons()[0].id).toBe('current'); expect(component.error()).toBe('');
    expect(component.loading()).toBe(false);
  });

  it('keeps filters when paging and blocks page changes during loading or outside the result bounds', async () => {
    const pending = deferred<ReturnType<typeof result>>(); api.searchFiltered.mockReturnValueOnce(pending.promise);
    params.next(convertToParamMap({ keyword: 'Nail', location: 'Quận 1', page: '1', sort: 'rating' }));
    const component = render();
    component.move(1); expect(router.navigate).not.toHaveBeenCalled();
    pending.resolve(result('page', 35, false)); await settle(); component.move(1);
    expect(router.navigate).toHaveBeenLastCalledWith(['/search'], { queryParams: expect.objectContaining({ keyword: 'Nail', location: 'Quận 1', sort: 'rating', page: 2 }) });
    params.next(convertToParamMap({ keyword: 'Nail' })); fixture!.detectChanges(); await settle();
    router.navigate.mockClear(); component.move(-1); component.move(1);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('resets pagination on sort and clear actions while retaining only the intended filters', async () => {
    params.next(convertToParamMap({ keyword: 'Nail', location: 'Quận 1', date: '2026-10-19', page: '4' }));
    const component = render(); await settle(); component.changeSort('rating');
    expect(router.navigate).toHaveBeenLastCalledWith(['/search'], { queryParams: expect.objectContaining({ keyword: 'Nail', location: 'Quận 1', date: '2026-10-19', sort: 'rating', page: undefined }) });
    component.changeSort('unsupported'); expect(router.navigate).toHaveBeenCalledOnce();
    state.coordinates.set({ lat: 10.77, lng: 106.7 }); component.clearFilters();
    expect(state.filters()).toEqual(DEFAULT_SEARCH_FILTERS); expect(state.coordinates()).toBeNull();
    const query = router.navigate.mock.lastCall![1].queryParams;
    expect(query.keyword).toBeUndefined(); expect(query.location).toBeUndefined(); expect(query.page).toBeUndefined();
  });

  it('does not search or request location automatically when a nearby URL has no session center', async () => {
    const locate = vi.spyOn(state, 'requestLocation');
    params.next(convertToParamMap({ nearby: '1', sort: 'distance', radiusKm: '10', latitude: '1', longitude: '2' }));
    const component = render(); await settle();
    expect(component.needsLocation()).toBe(true); expect(component.loading()).toBe(false);
    expect(component.salons()).toEqual([]); expect(api.searchFiltered).not.toHaveBeenCalled(); expect(locate).not.toHaveBeenCalled();
    state.coordinates.set({ lat: 0, lng: 106.7 }); fixture!.detectChanges(); await settle();
    expect(component.needsLocation()).toBe(false);
    expect(api.searchFiltered).toHaveBeenCalledWith(expect.objectContaining({ latitude: 0, longitude: 106.7, radiusKm: 10, sort: 'distance' }), 0);
  });

  it('retains manual search when location is denied and navigates nearby only after an explicit successful request', async () => {
    const locate = vi.spyOn(state, 'requestLocation').mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const component = render(); await settle();
    await component.locate(); expect(locate).toHaveBeenCalledOnce(); expect(router.navigate).not.toHaveBeenCalled();
    state.coordinates.set({ lat: 10.77, lng: 106.7 }); await component.locate();
    expect(router.navigate).toHaveBeenCalledWith(['/search'], { queryParams: expect.objectContaining({ nearby: '1', sort: 'distance', page: undefined }) });
    expect(JSON.stringify(router.navigate.mock.lastCall)).not.toContain('106.7');
  });

  it('does not reopen search if a location request succeeds after the page has been destroyed', async () => {
    const permission = deferred<boolean>();
    vi.spyOn(state, 'requestLocation').mockReturnValue(permission.promise);
    const component = render(); await settle(); const locating = component.locate();
    fixture!.destroy(); fixture = undefined;
    permission.resolve(true); await locating;
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('shows the current API error and allows a successful retry without changing filters', async () => {
    api.searchFiltered.mockRejectedValueOnce({ status: 400, error: { message: 'Ngày giờ không hợp lệ' } }).mockResolvedValueOnce(result('retry'));
    params.next(convertToParamMap({ keyword: 'Nail', location: 'Quận 1' }));
    const component = render(); await settle();
    expect(component.error()).toBe('Ngày giờ không hợp lệ'); expect(component.loading()).toBe(false);
    component.retry(); await settle();
    expect(component.error()).toBe(''); expect(component.salons()[0].id).toBe('retry');
    expect(api.searchFiltered.mock.calls[1]).toEqual(api.searchFiltered.mock.calls[0]);
  });

  it('discards a response and unsubscribes from route updates after navigation destroys the page', async () => {
    const pending = deferred<ReturnType<typeof result>>(); api.searchFiltered.mockReturnValueOnce(pending.promise);
    const component = render(); fixture!.destroy(); fixture = undefined;
    params.next(convertToParamMap({ keyword: 'After destroy' })); pending.resolve(result('late'));
    await Promise.resolve(); await Promise.resolve();
    expect(api.searchFiltered).toHaveBeenCalledOnce(); expect(component.salons()).toEqual([]); expect(component.total()).toBe(0);
  });
});
