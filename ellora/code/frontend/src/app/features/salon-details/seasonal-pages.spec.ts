import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Salon } from '../../models/ellora.model';
import { MockDataService } from '../../services/mock-data.service';
import { SalonApiService } from '../../services/salon-api.service';
import { SEASONAL_CLOCK, SeasonalService } from '../../services/seasonal.service';
import { SeasonalSceneComponent } from '../../shared/components/seasonal-scene/seasonal-scene.component';
import { Home } from '../home-page/home/home.component';
import { SalonDetails } from './salon-details.component';

describe('Seasonal Home and effective VIP detail integration', () => {
  const api = { detail: vi.fn(), services: vi.fn(), reviews: vi.fn(), workingHours: vi.fn(), search: vi.fn(), searchFiltered: vi.fn() };
  const salon = (id: string, tier: Salon['subscriptionTier']): Salon => ({
    id, name: 'Tiệm ' + id, address: '12 Lê Lợi', city: 'HCM', description: '', rating: 4.5, reviewCount: 2,
    images: ['/salon-placeholder.svg'], coordinates: null, subscriptionTier: tier,
    subscriptionBadge: tier === 'VIP' ? 'Shop đối tác' : tier === 'STANDARD' ? 'Shop yêu thích' : null
  });
  const deferred = <T,>() => {
    let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  };
  let records: Record<string, Salon>;
  let harness: RouterTestingHarness;
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); harness.detectChanges(); };
  const scenes = () => harness.routeDebugElement!.queryAll(By.directive(SeasonalSceneComponent));
  const scene = () => scenes()[0].componentInstance as SeasonalSceneComponent;

  beforeEach(() => {
    vi.resetAllMocks(); records = { '1': salon('1', 'VIP'), '2': salon('2', 'STANDARD'), '3': salon('3', null) };
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      media: query, matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn()
    })));
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
    api.detail.mockImplementation((id: string) => Promise.resolve(records[id]));
    api.services.mockResolvedValue([]); api.reviews.mockResolvedValue({ content: [] }); api.workingHours.mockResolvedValue([]);
    api.search.mockResolvedValue({ content: [records['3']], totalElements: 1, last: true });
    api.searchFiltered.mockResolvedValue({ content: [], totalElements: 0, last: true });
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: '', component: Home }, { path: 'salon/:id', component: SalonDetails }]),
      { provide: SalonApiService, useValue: api }, { provide: MockDataService, useValue: { categories: [] } },
      { provide: SEASONAL_CLOCK, useValue: () => new Date('2026-10-18T01:00:00Z') }
    ] });
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  it('renders the current seasonal Home border independently of salon subscriptions', async () => {
    harness = await RouterTestingHarness.create('/'); await settle();
    expect(scenes()).toHaveLength(1); expect(scene().scene()).toBe('home-border');
    const root = harness.routeNativeElement!;
    expect(root.querySelector('.seasonal-art')?.getAttribute('data-season')).toBe('autumn');
    expect(root.querySelector('.seasonal-frame')).not.toBeNull();
    expect(root.querySelector('app-salon-search-form input[type=date]')).not.toBeNull();
    expect(root.querySelectorAll('h1')).toHaveLength(1);
  });

  it('renders the VIP scene only after an effective VIP detail response arrives', async () => {
    const pending = deferred<Salon>(); api.detail.mockReturnValueOnce(pending.promise);
    harness = await RouterTestingHarness.create('/salon/1'); await settle();
    expect(scenes()).toHaveLength(0);
    pending.resolve(records['1']); await settle();
    expect(scenes()).toHaveLength(1); expect(scene().scene()).toBe('vip-detail');
    const art = harness.routeNativeElement!.querySelector('.seasonal-art');
    expect(art?.getAttribute('aria-hidden')).toBe('true'); expect(art?.getAttribute('data-season')).toBe('autumn');
    expect(harness.routeNativeElement!.querySelector('h1')?.textContent).toContain('Tiệm 1');
  });

  it.each(['2', '3'])('removes a prior VIP scene during loading and keeps it absent for STANDARD/null salon %s', async id => {
    harness = await RouterTestingHarness.create('/salon/1'); await settle(); expect(scenes()).toHaveLength(1);
    const pending = deferred<Salon>(); api.detail.mockReturnValueOnce(pending.promise);
    await harness.navigateByUrl('/salon/' + id, SalonDetails); await settle();
    expect(scenes()).toHaveLength(0);
    pending.resolve(records[id]); await settle();
    expect(scenes()).toHaveLength(0); expect(harness.routeNativeElement!.querySelector('h1')?.textContent).toContain('Tiệm ' + id);
  });

  it('does not retain a VIP scene if the next salon read fails', async () => {
    harness = await RouterTestingHarness.create('/salon/1'); await settle();
    api.detail.mockRejectedValueOnce(new Error('not found'));
    await harness.navigateByUrl('/salon/missing', SalonDetails); await settle();
    expect(scenes()).toHaveLength(0); expect(harness.routeNativeElement!.textContent).toContain('chưa tải được');
  });

  it('cannot restore stale VIP decoration after a newer no-tier salon has loaded', async () => {
    const pending = deferred<Salon>(); api.detail.mockReturnValueOnce(pending.promise);
    harness = await RouterTestingHarness.create('/salon/1'); await settle();
    await harness.navigateByUrl('/salon/3', SalonDetails); await settle(); expect(scenes()).toHaveLength(0);
    pending.resolve(records['1']); await settle();
    expect(scenes()).toHaveLength(0); expect(harness.routeNativeElement!.querySelector('h1')?.textContent).toContain('Tiệm 3');
  });

  it('retains the user pause setting across Home to VIP navigation and clears no entitlement controls', async () => {
    harness = await RouterTestingHarness.create('/'); await settle();
    const pause = scenes()[0].nativeElement.querySelector('button') as HTMLButtonElement; pause.click(); await settle();
    expect(TestBed.inject(SeasonalService).paused()).toBe(true); expect(pause.getAttribute('aria-pressed')).toBe('true');
    await harness.navigateByUrl('/salon/1', SalonDetails); await settle();
    expect(scene().scene()).toBe('vip-detail'); expect(scene().running()).toBe(false);
    expect(scenes()[0].nativeElement.querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
    expect(harness.routeNativeElement!.querySelector('app-salon-subscription-badge')?.textContent).toContain('Shop đối tác');
  });
});
