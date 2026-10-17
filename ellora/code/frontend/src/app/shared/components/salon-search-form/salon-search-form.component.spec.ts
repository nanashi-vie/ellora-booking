import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SEARCH_FILTERS, PublicSalonSearchService, SearchPosition } from '../../../services/public-salon-search.service';
import { SalonSearchFormComponent } from './salon-search-form.component';

describe('Salon search form', () => {
  let fixture: ComponentFixture<SalonSearchFormComponent>;
  const state = {
    filters: signal({ ...DEFAULT_SEARCH_FILTERS }), coordinates: signal<SearchPosition | null>(null),
    locating: signal(false), error: signal(''), navigate: vi.fn(), requestLocation: vi.fn(), clearLocation: vi.fn()
  };
  const render = () => { fixture = TestBed.createComponent(SalonSearchFormComponent); fixture.detectChanges(); return fixture.componentInstance; };
  const input = (suffix: string, value: string) => {
    const element = fixture.nativeElement.querySelector('#salon-search-' + suffix) as HTMLInputElement;
    element.value = value; element.dispatchEvent(new Event('input')); fixture.detectChanges(); return element;
  };
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-18T07:00:12Z'));
    vi.resetAllMocks(); state.filters.set({ ...DEFAULT_SEARCH_FILTERS }); state.coordinates.set(null); state.locating.set(false); state.error.set('');
    state.navigate.mockResolvedValue(true); state.requestLocation.mockResolvedValue(false);
    state.clearLocation.mockImplementation(() => { state.coordinates.set(null); state.error.set(''); });
    TestBed.configureTestingModule({ imports: [SalonSearchFormComponent], providers: [{ provide: PublicSalonSearchService, useValue: state }] });
  });
  afterEach(() => { fixture?.destroy(); TestBed.resetTestingModule(); vi.useRealTimers(); });

  it('submits native contact-free controls with trimmed filters and emits only after navigation succeeds', async () => {
    const component = render(); const emitted = vi.fn(); component.searched.subscribe(emitted);
    expect(state.requestLocation).not.toHaveBeenCalled();
    input('keyword', '  Sơn gel  '); input('location', '  Quận 1  '); input('date', '2026-10-19'); input('time', '09:07');
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(state.navigate).toHaveBeenCalledWith({ ...DEFAULT_SEARCH_FILTERS, keyword: 'Sơn gel', location: 'Quận 1', date: '2026-10-19', time: '09:07' });
    expect(emitted).toHaveBeenCalledOnce();
    expect((fixture.nativeElement.querySelector('input[type=date]') as HTMLInputElement).min).toBe('2026-10-18');
    expect(fixture.nativeElement.textContent).toContain('chưa xác nhận chỗ trống');
  });

  it('allows date-only searches and blocks missing dates, invalid dates and stale times before navigation', async () => {
    const component = render();
    component.form.patchValue({ date: '', time: '15:01' }); await component.submit();
    expect(component.form.hasError('dateRequired')).toBe(true); expect(state.navigate).not.toHaveBeenCalled();
    component.form.patchValue({ date: '2026-02-30', time: '' }); await component.submit();
    expect(component.form.hasError('dateRange')).toBe(true);
    component.form.patchValue({ date: '2026-10-18', time: '15:00' }); await component.submit();
    expect(component.form.hasError('timeTooSoon')).toBe(true);
    component.form.patchValue({ time: '15:01' }); await component.submit(); expect(state.navigate).toHaveBeenCalledOnce();
    component.form.patchValue({ date: '2026-10-18', time: '' }); await component.submit(); expect(state.navigate).toHaveBeenCalledTimes(2);
    component.form.patchValue({ time: '15:01' }); vi.setSystemTime(new Date('2026-10-18T07:02:00Z')); await component.submit();
    expect(component.form.hasError('timeTooSoon')).toBe(true); expect(state.navigate).toHaveBeenCalledTimes(2);
  });

  it('handles Vietnam midnight and the leap-day year boundary without browser timezone dependence', () => {
    vi.setSystemTime(new Date('2028-02-29T16:30:12Z')); const component = render();
    expect(component.today()).toBe('2028-02-29'); expect(component.latestDate()).toBe('2029-02-28');
    component.form.patchValue({ date: '2028-03-01', time: '00:30' }); expect(component.form.hasError('timeTooSoon')).toBe(true);
    component.form.patchValue({ time: '00:31' }); expect(component.form.valid).toBe(true);
  });

  it('retains edits when refreshing the clock after restoring date filters and renders a custom radius', () => {
    state.filters.set({ ...DEFAULT_SEARCH_FILTERS, date: '2026-10-19', time: '10:00', nearby: true, radiusKm: 7, sort: 'distance' });
    const component = render();
    expect((fixture.nativeElement.querySelector('select') as HTMLSelectElement).selectedOptions[0].textContent).toContain('7 km');
    input('keyword', 'New draft'); input('date', '2026-10-20'); input('time', '11:07');
    vi.setSystemTime(new Date('2026-10-18T07:02:00Z')); component.refreshClock(); fixture.detectChanges();
    expect(component.form.getRawValue()).toMatchObject({ keyword: 'New draft', date: '2026-10-20', time: '11:07', radiusKm: 7 });
  });

  it('uses location only after a click, supports zero coordinates and clears nearby when an area is typed', async () => {
    const component = render();
    state.requestLocation.mockImplementation(async () => { state.coordinates.set({ lat: 0, lng: 0 }); return true; });
    (fixture.nativeElement.querySelector('.salon-search-position') as HTMLButtonElement).click(); await Promise.resolve(); fixture.detectChanges();
    expect(component.form.controls.nearby.value).toBe(true); expect(state.requestLocation).toHaveBeenCalledOnce();
    await component.submit(); expect(state.navigate.mock.calls[0][0]).toMatchObject({ nearby: true, sort: 'distance', radiusKm: 5 });
    input('location', 'Đà Nẵng'); expect(component.form.controls.nearby.value).toBe(false); expect(state.coordinates()).toBeNull();
    await component.submit(); expect(state.navigate.mock.calls[1][0]).toMatchObject({ nearby: false, location: 'Đà Nẵng', sort: 'newest' });
  });

  it('keeps manual searching available after denied or late geolocation and after navigation errors', async () => {
    const component = render(); state.error.set('Bạn chưa cho phép định vị.');
    await component.useLocation(); fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Bạn chưa cho phép định vị.');
    let finish!: (granted: boolean) => void; state.requestLocation.mockReturnValue(new Promise<boolean>(resolve => finish = resolve));
    const pending = component.useLocation(); input('location', 'Quận 7'); finish(true); await pending;
    expect(component.form.controls.nearby.value).toBe(false); expect(component.form.controls.location.value).toBe('Quận 7');
    state.navigate.mockRejectedValue(new Error('offline')); await component.submit(); fixture.detectChanges();
    expect(component.error()).toContain('Vui lòng thử lại'); expect(component.submitting()).toBe(false);
    expect(component.form.controls.location.value).toBe('Quận 7');
  });
});
