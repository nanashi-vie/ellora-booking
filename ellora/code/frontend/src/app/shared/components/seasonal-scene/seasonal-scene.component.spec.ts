import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEASONAL_CLOCK, SeasonalService } from '../../../services/seasonal.service';
import { SeasonalSceneComponent } from './seasonal-scene.component';

describe('Seasonal scene', () => {
  let fixture: ComponentFixture<SeasonalSceneComponent>;
  const preferences = (matches = false) => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    const query = { matches, addEventListener: vi.fn((_event: string, callback: typeof listener) => { listener = callback; }), removeEventListener: vi.fn() };
    const matchMedia = vi.fn(() => query as unknown as MediaQueryList);
    vi.stubGlobal('matchMedia', matchMedia);
    return { query, matchMedia, change: (reduced: boolean) => listener?.({ matches: reduced } as MediaQueryListEvent) };
  };
  async function mount(month = 7, scene: 'home-border' | 'vip-detail' = 'home-border', platform = 'browser') {
    TestBed.configureTestingModule({ imports: [SeasonalSceneComponent], providers: [
      { provide: SEASONAL_CLOCK, useValue: () => new Date(`2026-${String(month).padStart(2, '0')}-10T00:00:00Z`) },
      { provide: PLATFORM_ID, useValue: platform }
    ] });
    fixture = TestBed.createComponent(SeasonalSceneComponent);
    fixture.componentRef.setInput('scene', scene);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  afterEach(() => { fixture?.destroy(); TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  it.each([
    [4, 'spring', '.flower', '.flower--peach', 6],
    [7, 'summer', '.lifebuoy', '.seasonal-waves', 1],
    [10, 'autumn', '.maple-leaf', '.maple-leaf--gold', 6],
    [1, 'winter', '.snow', '.snow--flake', 8]
  ] as const)('renders the bounded %s-month motif, including its characteristic detail', async (month, season, motif, characteristic, count) => {
    preferences(); const host = await mount(month);
    expect(host.querySelector('.seasonal-art')?.getAttribute('data-season')).toBe(season);
    expect(host.querySelectorAll('.seasonal-piece')).toHaveLength(12);
    expect(host.querySelectorAll(motif)).toHaveLength(12);
    expect(host.querySelectorAll(characteristic)).toHaveLength(count);
    const before = [...host.querySelectorAll<HTMLElement>('.seasonal-piece')].map(element => element.style.cssText);
    fixture.detectChanges();
    expect([...host.querySelectorAll<HTMLElement>('.seasonal-piece')].map(element => element.style.cssText)).toEqual(before);
  });

  it('keeps decoration hidden from assistive technology and the native pause button outside it', async () => {
    preferences(); const host = await mount(7, 'vip-detail');
    const art = host.querySelector('.seasonal-art')!;
    expect(art.getAttribute('aria-hidden')).toBe('true');
    expect(art.getAttribute('data-scene')).toBe('vip-detail');
    expect(art.querySelector('button,a,input,[tabindex]')).toBeNull();
    expect(host.querySelector('.seasonal-frame')).not.toBeNull();
    const button = host.querySelector('button')!;
    expect(button.type).toBe('button'); expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(art.contains(button)).toBe(false);
    expect(fixture.componentInstance.running()).toBe(true);
    button.click(); fixture.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toContain('Bật chuyển động');
    expect(fixture.componentInstance.running()).toBe(false);
    expect(TestBed.inject(SeasonalService).paused()).toBe(true);
    button.click(); fixture.detectChanges(); expect(fixture.componentInstance.running()).toBe(true);
  });

  it('honours changed reduced-motion settings and removes its listener on destruction', async () => {
    const media = preferences(true); const host = await mount();
    expect(media.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(fixture.componentInstance.running()).toBe(false);
    expect(host.querySelector('.motion-note')?.textContent).toContain('giảm chuyển động');
    const button = host.querySelector('button')!;
    button.click(); button.click(); fixture.detectChanges();
    expect(fixture.componentInstance.running()).toBe(false);
    media.change(false); fixture.detectChanges(); expect(fixture.componentInstance.running()).toBe(true);
    fixture.destroy();
    expect(media.query.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    media.change(true); expect(fixture.componentInstance.reducedMotion()).toBe(false);
  });

  it('renders an SSR-safe static frame without reading browser preferences', async () => {
    const media = preferences(); const host = await mount(4, 'home-border', 'server');
    expect(media.matchMedia).not.toHaveBeenCalled();
    expect(fixture.componentInstance.running()).toBe(false);
    expect(host.querySelector('.seasonal-frame')).not.toBeNull();
    expect(host.querySelectorAll('.flower')).toHaveLength(12);
  });

  it('stays static when matchMedia is unavailable and supports old preference listeners', async () => {
    vi.stubGlobal('matchMedia', undefined);
    await mount(); expect(fixture.componentInstance.running()).toBe(false);
    fixture.destroy(); TestBed.resetTestingModule();
    const legacy = { matches: true, addListener: vi.fn(), removeListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => legacy));
    await mount(); expect(legacy.addListener).toHaveBeenCalledTimes(1);
    fixture.destroy(); expect(legacy.removeListener).toHaveBeenCalledTimes(1);
  });
});
