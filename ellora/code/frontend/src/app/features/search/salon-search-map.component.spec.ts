import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Salon } from '../../models/ellora.model';
import { LeafletMapService } from '../../services/leaflet-map.service';
import { SalonSearchMapComponent } from './salon-search-map.component';

describe('Public search result map', () => {
  let fixture: ComponentFixture<SalonSearchMapComponent> | undefined;
  let observers: MockIntersectionObserver[];
  let resizers: MockResizeObserver[];
  let map: any, tiles: any, library: any;
  let markers: any[];
  let tileEvents: Record<string, () => void>;
  const loader = { load: vi.fn() };

  class MockIntersectionObserver {
    observe = vi.fn(); disconnect = vi.fn(); unobserve = vi.fn();
    constructor(readonly callback: IntersectionObserverCallback) { observers.push(this); }
    intersect(isIntersecting: boolean) { this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
  }
  class MockResizeObserver {
    observe = vi.fn(); disconnect = vi.fn(); unobserve = vi.fn();
    constructor(readonly callback: ResizeObserverCallback) { resizers.push(this); }
    resize() { this.callback([], this as unknown as ResizeObserver); }
  }
  const salon = (id = '1', coordinates: Salon['coordinates'] = { lat: 10.77, lng: 106.7 }, extras: Partial<Salon> = {}) => ({
    id, name: 'Tiệm ' + id, description: '', address: '12 Nguyễn Huệ', district: 'Quận 1', city: 'Hồ Chí Minh',
    coordinates, rating: 5, reviewCount: 1, images: [], ...extras
  });
  const render = (salons = [salon()]) => {
    fixture = TestBed.createComponent(SalonSearchMapComponent);
    fixture.componentRef.setInput('salons', salons); fixture.detectChanges();
    return fixture.componentInstance;
  };
  const settle = async () => { await fixture!.whenStable(); fixture!.detectChanges(); };

  beforeEach(() => {
    vi.resetAllMocks(); observers = []; resizers = []; markers = []; tileEvents = {};
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver); vi.stubGlobal('ResizeObserver', MockResizeObserver);
    map = { off: vi.fn(), remove: vi.fn(), setView: vi.fn(), fitBounds: vi.fn(), invalidateSize: vi.fn(), on: vi.fn() };
    tiles = { on: vi.fn((name, callback) => { tileEvents[name] = callback; return tiles; }), off: vi.fn(), addTo: vi.fn() };
    tiles.addTo.mockReturnValue(tiles);
    library = {
      map: vi.fn().mockReturnValue(map), tileLayer: vi.fn().mockReturnValue(tiles), divIcon: vi.fn().mockReturnValue({}),
      latLngBounds: vi.fn().mockReturnValue('current-page-bounds'),
      marker: vi.fn(() => {
        const marker: any = { off: vi.fn(), on: vi.fn(), bindPopup: vi.fn(), addTo: vi.fn() };
        marker.bindPopup.mockReturnValue(marker); marker.addTo.mockReturnValue(marker); markers.push(marker); return marker;
      })
    };
    loader.load.mockResolvedValue(library);
    TestBed.configureTestingModule({ imports: [SalonSearchMapComponent], providers: [{ provide: LeafletMapService, useValue: loader }] });
  });
  afterEach(() => { fixture?.destroy(); fixture = undefined; TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  it('waits until visible and imports once across repeated visibility notifications', async () => {
    const component = render();
    expect(loader.load).not.toHaveBeenCalled(); expect(observers).toHaveLength(1);
    observers[0].intersect(false); expect(loader.load).not.toHaveBeenCalled();
    observers[0].intersect(true); observers[0].intersect(true); await settle();
    expect(loader.load).toHaveBeenCalledOnce(); expect(library.map).toHaveBeenCalledOnce();
    expect(component.ready()).toBe(true); expect(component.loading()).toBe(false);
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it('omits missing and invalid pins without loading Leaflet, while preserving a real zero point', async () => {
    const invalid = [null, { lat: NaN, lng: 1 }, { lat: 1, lng: Infinity }, { lat: 91, lng: 0 }, { lat: 0, lng: -181 }];
    const component = render(invalid.map((point, index) => salon(String(index), point)));
    await component.loadMap();
    expect(component.points()).toEqual([]); expect(loader.load).not.toHaveBeenCalled(); expect(observers).toHaveLength(0);
    expect((fixture!.nativeElement as HTMLElement).textContent).toContain('Chưa có salon có vị trí bản đồ');
    fixture!.componentRef.setInput('salons', [salon('zero', { lat: 0, lng: 0 }), salon('missing', null)]); fixture!.detectChanges();
    await component.loadMap();
    expect(library.marker).toHaveBeenCalledOnce(); expect(library.marker).toHaveBeenCalledWith([0, 0], expect.objectContaining({ draggable: false }));
    expect(map.setView).toHaveBeenCalledWith([0, 0], 15); expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it('fits only current-page approved coordinates and keeps pins read-only with canonical tiles and credit', async () => {
    const component = render([salon('1'), salon('2', { lat: 21.03, lng: 105.85 }), salon('3', null)]);
    await component.loadMap(); fixture!.detectChanges();
    expect(library.latLngBounds).toHaveBeenCalledWith([[10.77, 106.7], [21.03, 105.85]]);
    expect(map.fitBounds).toHaveBeenCalledWith('current-page-bounds', { padding: [30, 30], maxZoom: 15 });
    expect(map.setView).not.toHaveBeenCalled(); expect(library.marker).toHaveBeenCalledTimes(2);
    expect(library.map.mock.calls[0][1]).toEqual({ scrollWheelZoom: false });
    expect(library.marker.mock.calls.every(([, options]: [unknown, any]) => options.draggable === false)).toBe(true);
    expect(map.on).not.toHaveBeenCalled(); for (const marker of markers) expect(marker.on).not.toHaveBeenCalled();
    expect(library.tileLayer).toHaveBeenCalledWith('https://tile.openstreetmap.org/{z}/{x}/{y}.png', expect.objectContaining({ attribution: expect.stringContaining('https://www.openstreetmap.org/copyright') }));
    const root = fixture!.nativeElement as HTMLElement;
    expect(root.querySelector('.search-map__caption')?.textContent).toContain('2 salon');
    expect(root.querySelector<HTMLAnchorElement>('a[href="https://www.openstreetmap.org/copyright"]')?.textContent).toContain('OpenStreetMap');
  });

  it('uses text nodes for salon-supplied popup content and a correctly encoded local detail link', async () => {
    const name = '<img src=x onerror=alert(1)>', address = '<script>alert(2)</script>';
    const component = render([salon('a/b?c=1', undefined, { name, address, district: null, city: 'HCM' })]);
    await component.loadMap();
    const popup = markers[0].bindPopup.mock.calls[0][0] as HTMLElement;
    expect(popup.querySelector('strong')?.textContent).toBe(name); expect(popup.querySelector('p')?.textContent).toBe(address + ', HCM');
    expect(popup.querySelector('img, script')).toBeNull();
    expect(popup.querySelector('a')?.getAttribute('href')).toBe('/salon/a%2Fb%3Fc%3D1');
    expect(popup.querySelector('a')?.textContent).toBe('Xem tiệm');
  });

  it('resizes after layout changes and cleans up the map, markers and observers when results disappear', async () => {
    const component = render(); await component.loadMap();
    expect(resizers).toHaveLength(1); resizers[0].resize(); expect(map.invalidateSize).toHaveBeenCalledOnce();
    fixture!.componentRef.setInput('salons', []); fixture!.detectChanges();
    expect(resizers[0].disconnect).toHaveBeenCalled(); expect(markers[0].off).toHaveBeenCalled();
    expect(tiles.off).toHaveBeenCalled(); expect(map.off).toHaveBeenCalled(); expect(map.remove).toHaveBeenCalledOnce();
    expect(component.ready()).toBe(false); await component.loadMap(); expect(loader.load).toHaveBeenCalledOnce();
  });

  it('keeps results usable after a tile failure and retries through the displayed button', async () => {
    const component = render(); await component.loadMap(); tileEvents['tileerror'](); fixture!.detectChanges();
    const root = fixture!.nativeElement as HTMLElement;
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Danh sách salon vẫn có thể sử dụng');
    expect(root.querySelector<HTMLElement>('.search-map__canvas')?.hidden).toBe(true);
    root.querySelector<HTMLButtonElement>('button')!.click(); await settle();
    expect(map.remove).toHaveBeenCalledOnce(); expect(tiles.off).toHaveBeenCalled(); expect(markers[0].off).toHaveBeenCalled();
    expect(loader.load).toHaveBeenCalledTimes(2); expect(component.error()).toBe(''); expect(component.ready()).toBe(true);
  });

  it('recovers from an import failure without leaving a permanent loading state', async () => {
    loader.load.mockRejectedValueOnce(new Error('chunk unavailable'));
    const component = render(); await component.loadMap(); fixture!.detectChanges();
    expect(component.loading()).toBe(false); expect(component.error()).toContain('Không mở được bản đồ');
    expect((fixture!.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
    await component.loadMap();
    expect(component.error()).toBe(''); expect(component.ready()).toBe(true); expect(loader.load).toHaveBeenCalledTimes(2);
  });

  it('discards a stale import and renders only the latest result page after it changes', async () => {
    let resolve!: (library: any) => void;
    loader.load.mockReturnValueOnce(new Promise(value => { resolve = value; }));
    const component = render(); const pending = component.loadMap();
    fixture!.componentRef.setInput('salons', [salon('next', { lat: 21.03, lng: 105.85 })]); fixture!.detectChanges();
    resolve(library); await pending; expect(library.map).not.toHaveBeenCalled();
    await component.loadMap();
    expect(library.marker).toHaveBeenCalledOnce(); expect(library.marker).toHaveBeenCalledWith([21.03, 105.85], expect.objectContaining({ title: 'Tiệm next' }));
    expect(map.setView).toHaveBeenCalledWith([21.03, 105.85], 15);
  });

  it('disconnects visibility tracking and discards imports after the page is destroyed', async () => {
    let resolve!: (library: any) => void;
    loader.load.mockReturnValueOnce(new Promise(value => { resolve = value; }));
    const component = render(); const pending = component.loadMap();
    fixture!.destroy(); fixture = undefined; resolve(library); await pending;
    expect(observers[0].disconnect).toHaveBeenCalled(); expect(library.map).not.toHaveBeenCalled();
  });

  it('never observes, loads Leaflet or requests tiles during server rendering', async () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const component = render(); await component.loadMap();
    expect(observers).toHaveLength(0); expect(resizers).toHaveLength(0);
    expect(loader.load).not.toHaveBeenCalled(); expect(library.tileLayer).not.toHaveBeenCalled();
    expect(component.loading()).toBe(false); expect(component.ready()).toBe(false);
  });
});
