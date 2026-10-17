import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeafletMapService } from '../../services/leaflet-map.service';
import { PublicSalonMapComponent } from './public-salon-map.component';

describe('Public salon map', () => {
  let fixture: ComponentFixture<PublicSalonMapComponent> | undefined;
  const loader = { load: vi.fn() };
  let observers: MockIntersectionObserver[];
  let map: any;
  let marker: any;
  let tiles: any;
  let library: any;
  let tileEvents: Record<string, (...args: any[]) => void>;

  class MockIntersectionObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    constructor(readonly callback: IntersectionObserverCallback) { observers.push(this); }
    intersect(isIntersecting: boolean) {
      this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
  }

  const render = (coordinates: { lat: number; lng: number } | null = { lat: 10.77, lng: 106.7 }) => {
    fixture = TestBed.createComponent(PublicSalonMapComponent);
    fixture.componentRef.setInput('coordinates', coordinates);
    fixture.detectChanges();
    return fixture.componentInstance;
  };
  const settle = async () => { await fixture!.whenStable(); fixture!.detectChanges(); };

  beforeEach(() => {
    vi.resetAllMocks();
    observers = [];
    tileEvents = {};
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    map = { on: vi.fn(), off: vi.fn(), remove: vi.fn(), invalidateSize: vi.fn(), setView: vi.fn() };
    marker = { on: vi.fn(), off: vi.fn(), remove: vi.fn(), addTo: vi.fn() };
    tiles = {
      on: vi.fn((name, callback) => { tileEvents[name] = callback; return tiles; }),
      off: vi.fn(), remove: vi.fn(), addTo: vi.fn()
    };
    map.on.mockReturnValue(map);
    marker.addTo.mockReturnValue(marker);
    tiles.addTo.mockReturnValue(tiles);
    library = {
      map: vi.fn().mockReturnValue(map), marker: vi.fn().mockReturnValue(marker),
      tileLayer: vi.fn().mockReturnValue(tiles), divIcon: vi.fn().mockReturnValue({})
    };
    loader.load.mockResolvedValue(library);
    TestBed.configureTestingModule({
      imports: [PublicSalonMapComponent],
      providers: [{ provide: LeafletMapService, useValue: loader }]
    });
  });

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('waits for visibility and initializes only once across repeated observer callbacks', async () => {
    const component = render();
    expect(loader.load).not.toHaveBeenCalled();
    expect(observers).toHaveLength(1);
    expect(observers[0].observe).toHaveBeenCalledWith(expect.any(HTMLElement));
    observers[0].intersect(false);
    expect(loader.load).not.toHaveBeenCalled();
    observers[0].intersect(true);
    observers[0].intersect(true);
    await settle();
    expect(loader.load).toHaveBeenCalledOnce();
    expect(library.map).toHaveBeenCalledOnce();
    expect(component.loading()).toBe(false);
    expect(component.ready()).toBe(true);
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it('does not import a map for missing or invalid points and preserves a real zero pin', async () => {
    const component = render(null);
    for (const point of [null, { lat: NaN, lng: 1 }, { lat: 1, lng: Infinity }, { lat: 91, lng: 0 }, { lat: 0, lng: -181 }]) {
      fixture!.componentRef.setInput('coordinates', point);
      fixture!.detectChanges();
      await component.loadMap();
      expect(loader.load).not.toHaveBeenCalled();
      expect((fixture!.nativeElement as HTMLElement).hidden).toBe(true);
    }
    expect(observers).toHaveLength(0);
    fixture!.componentRef.setInput('coordinates', { lat: 0, lng: 0 });
    fixture!.detectChanges();
    await component.loadMap();
    expect((fixture!.nativeElement as HTMLElement).hidden).toBe(false);
    expect(library.map).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ center: [0, 0] }));
    expect(library.marker).toHaveBeenCalledWith([0, 0], expect.objectContaining({ draggable: false }));
  });

  it('renders an approved pin read-only while retaining normal map navigation and OpenStreetMap credit', async () => {
    const component = render();
    await component.loadMap();
    fixture!.detectChanges();
    const options = library.map.mock.calls[0][1];
    expect(options.dragging).not.toBe(false);
    expect(options.zoomControl).not.toBe(false);
    expect(library.marker).toHaveBeenCalledWith([10.77, 106.7], expect.objectContaining({ draggable: false, title: expect.any(String) }));
    expect(map.on.mock.calls.some(([name]: [string]) => name === 'click')).toBe(false);
    expect(marker.on.mock.calls.some(([name]: [string]) => name === 'dragend')).toBe(false);
    expect(library.tileLayer).toHaveBeenCalledWith('https://tile.openstreetmap.org/{z}/{x}/{y}.png', expect.objectContaining({
      attribution: expect.stringContaining('https://www.openstreetmap.org/copyright')
    }));
    const credit = (fixture!.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a[href="https://www.openstreetmap.org/copyright"]');
    expect(credit?.textContent).toContain('OpenStreetMap');
  });

  it('shows a tile error and retries through the rendered action after cleaning the old map', async () => {
    const component = render();
    await component.loadMap();
    tileEvents['tileerror']();
    fixture!.detectChanges();
    const root = fixture!.nativeElement as HTMLElement;
    expect(component.error()).toBeTruthy();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('bản đồ');
    const retry = Array.from(root.querySelectorAll('button')).find(button => button.textContent?.includes('Thử lại'));
    expect(retry).toBeDefined();
    retry!.click();
    await settle();
    expect(map.remove).toHaveBeenCalledOnce();
    expect(tiles.off).toHaveBeenCalled();
    expect(library.map).toHaveBeenCalledTimes(2);
    expect(component.error()).toBe('');
    expect(component.ready()).toBe(true);
  });

  it('allows retry after an SDK import fails without leaving a loading state', async () => {
    loader.load.mockRejectedValueOnce(new Error('unavailable chunk'));
    const component = render();
    await component.loadMap();
    fixture!.detectChanges();
    expect(component.loading()).toBe(false);
    expect(component.error()).toBeTruthy();
    expect((fixture!.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
    await component.loadMap();
    expect(loader.load).toHaveBeenCalledTimes(2);
    expect(library.map).toHaveBeenCalledOnce();
    expect(component.error()).toBe('');
  });

  it('ignores a stale SDK import after the salon point changes and initializes the current point only', async () => {
    let resolve!: (sdk: unknown) => void;
    loader.load.mockReturnValueOnce(new Promise(sdk => { resolve = sdk; }));
    const component = render();
    const oldImport = component.loadMap();
    fixture!.componentRef.setInput('coordinates', { lat: 21.03, lng: 105.85 });
    fixture!.detectChanges();
    resolve(library);
    await oldImport;
    expect(library.map).not.toHaveBeenCalled();
    await component.loadMap();
    expect(library.map).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ center: [21.03, 105.85] }));
    expect(library.marker).toHaveBeenCalledWith([21.03, 105.85], expect.any(Object));
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it('removes the previous map and all listeners when a route change removes the approved pin', async () => {
    const component = render();
    await component.loadMap();
    fixture!.componentRef.setInput('coordinates', null);
    fixture!.detectChanges();
    expect(marker.off).toHaveBeenCalled();
    expect(tiles.off).toHaveBeenCalled();
    expect(map.off).toHaveBeenCalled();
    expect(map.remove).toHaveBeenCalledOnce();
    expect(component.ready()).toBe(false);
    await component.loadMap();
    expect(loader.load).toHaveBeenCalledOnce();
  });

  it('disconnects an observer on destroy and discards an import that completes after navigation', async () => {
    let resolve!: (sdk: unknown) => void;
    loader.load.mockReturnValueOnce(new Promise(sdk => { resolve = sdk; }));
    const component = render();
    const pending = component.loadMap();
    fixture!.destroy();
    fixture = undefined;
    resolve(library);
    await pending;
    expect(observers[0].disconnect).toHaveBeenCalled();
    expect(library.map).not.toHaveBeenCalled();
  });

  it('never observes the viewport, imports Leaflet or requests tiles while rendering on the server', async () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const component = render();
    await component.loadMap();
    expect(observers).toHaveLength(0);
    expect(loader.load).not.toHaveBeenCalled();
    expect(library.tileLayer).not.toHaveBeenCalled();
    expect(component.loading()).toBe(false);
    expect(component.ready()).toBe(false);
  });
});
