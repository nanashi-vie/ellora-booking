import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SalonLocationPickerComponent } from './salon-location-picker.component';
import { LeafletMapService } from '../../../services/leaflet-map.service';

describe('Salon location picker', () => {
  let fixture: ComponentFixture<SalonLocationPickerComponent>;
  const loader = { load: vi.fn() };
  let mapEvents: Record<string, (...args: any[]) => void>;
  let tileEvents: Record<string, (...args: any[]) => void>;
  let markerEvents: Record<string, (...args: any[]) => void>;
  let map: any; let tiles: any; let marker: any; let library: any;
  const render = () => { fixture = TestBed.createComponent(SalonLocationPickerComponent); fixture.detectChanges(); return fixture.componentInstance; };
  beforeEach(() => {
    vi.resetAllMocks(); mapEvents = {}; tileEvents = {}; markerEvents = {};
    map = { on: vi.fn((name, callback) => { mapEvents[name] = callback; return map; }), off: vi.fn(), remove: vi.fn(), setView: vi.fn(), getZoom: vi.fn().mockReturnValue(5) };
    tiles = { on: vi.fn((name, callback) => { tileEvents[name] = callback; return tiles; }), off: vi.fn(), addTo: vi.fn() };
    marker = { on: vi.fn((name, callback) => { markerEvents[name] = callback; return marker; }), off: vi.fn(), remove: vi.fn(), addTo: vi.fn(), setLatLng: vi.fn(), getLatLng: vi.fn(), dragging: { enable: vi.fn(), disable: vi.fn() } };
    marker.addTo.mockReturnValue(marker);
    library = { map: vi.fn().mockReturnValue(map), tileLayer: vi.fn().mockReturnValue(tiles), marker: vi.fn().mockReturnValue(marker), divIcon: vi.fn().mockReturnValue({}) };
    loader.load.mockResolvedValue(library);
    TestBed.configureTestingModule({ imports: [SalonLocationPickerComponent], providers: [{ provide: LeafletMapService, useValue: loader }] });
  });
  afterEach(() => { fixture?.destroy(); TestBed.resetTestingModule(); });

  it('loads no map until opened and does not turn its default viewport into a selected pin', async () => {
    const component = render(); const selected = vi.fn(); component.selectionChange.subscribe(selected);
    expect(loader.load).not.toHaveBeenCalled();
    await component.openMap(); fixture.detectChanges();
    expect(loader.load).toHaveBeenCalledOnce(); expect(library.map).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ zoom: 5 }));
    expect(library.marker).not.toHaveBeenCalled(); expect(selected).not.toHaveBeenCalled();
    expect(library.tileLayer).toHaveBeenCalledWith('https://tile.openstreetmap.org/{z}/{x}/{y}.png', expect.objectContaining({ noWrap: true, attribution: expect.stringContaining('https://www.openstreetmap.org/copyright') }));
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.location-attribution a')!.href).toBe('https://www.openstreetmap.org/copyright');
  });

  it('starts on a saved zero pin, emits map clicks and dragged coordinates, and removes an invalidated pin', async () => {
    const component = render(); const selected = vi.fn(); component.selectionChange.subscribe(selected);
    fixture.componentRef.setInput('value', { latitude: 0, longitude: 0 }); fixture.detectChanges();
    await component.openMap();
    expect(library.map).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ center: [0, 0], zoom: 16 }));
    expect(library.marker).toHaveBeenCalledWith([0, 0], expect.objectContaining({ draggable: true }));
    mapEvents['click']({ latlng: { lat: 10.81234567, lng: 106.71234567 } });
    expect(selected).toHaveBeenLastCalledWith({ latitude: 10.812346, longitude: 106.712346 });
    marker.getLatLng.mockReturnValue({ lat: 11.2, lng: 107.3 }); markerEvents['dragend']();
    expect(selected).toHaveBeenLastCalledWith({ latitude: 11.2, longitude: 107.3 });
    fixture.componentRef.setInput('value', null); fixture.detectChanges(); expect(marker.remove).toHaveBeenCalled();
  });

  it('validates complete finite ranges and permits the zero and boundary coordinates without opening the map', () => {
    const component = render(); const selected = vi.fn(); component.selectionChange.subscribe(selected);
    for (const point of [{ latitude: '', longitude: '' }, { latitude: '91', longitude: '0' }, { latitude: '0', longitude: '-181' }, { latitude: 'Infinity', longitude: '1' }, { latitude: '0abc', longitude: '1' }]) {
      component.manualForm.setValue(point); component.applyCoordinates(); expect(component.manualError()).toContain('Nhập đủ');
    }
    expect(selected).not.toHaveBeenCalled();
    for (const point of [{ latitude: '0', longitude: '0' }, { latitude: '-90', longitude: '180' }, { latitude: '90', longitude: '-180' }]) {
      component.manualForm.setValue(point); component.applyCoordinates();
      expect(selected).toHaveBeenLastCalledWith({ latitude: Number(point.latitude), longitude: Number(point.longitude) }); expect(component.manualError()).toBe('');
    }
    expect(loader.load).not.toHaveBeenCalled();
  });

  it('applies manual coordinates on Enter and prevents a surrounding form from submitting', () => {
    const component = render(); const selected = vi.fn(); component.selectionChange.subscribe(selected);
    const root = fixture.nativeElement as HTMLElement;
    for (const [id, value] of [['salon-latitude', '10.77'], ['salon-longitude', '106.7']]) {
      const input = root.querySelector<HTMLInputElement>(`#${id}`)!; input.value = value; input.dispatchEvent(new Event('input'));
    }
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }); root.querySelector('#salon-longitude')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true); expect(selected).toHaveBeenCalledWith({ latitude: 10.77, longitude: 106.7 });
  });

  it('locks coordinate changes while keeping map navigation available when a request becomes pending', async () => {
    const component = render(); const selected = vi.fn(); component.selectionChange.subscribe(selected);
    fixture.componentRef.setInput('value', { latitude: 10, longitude: 106 }); fixture.detectChanges(); await component.openMap();
    fixture.componentRef.setInput('disabled', true); fixture.detectChanges();
    expect(marker.dragging.disable).toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).querySelector('fieldset')!.disabled).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('.location-map')!.hasAttribute('inert')).toBe(false);
    mapEvents['click']({ latlng: { lat: 11, lng: 107 } }); component.manualForm.setValue({ latitude: '11', longitude: '107' }); component.applyCoordinates();
    expect(selected).not.toHaveBeenCalled();
  });

  it('allows a pending profile to open the map for viewing and explains why editing is locked', async () => {
    const component = render(); const selected = vi.fn(); component.selectionChange.subscribe(selected);
    fixture.componentRef.setInput('disabled', true);
    fixture.componentRef.setInput('disabledReason', 'Hồ sơ đang chờ Admin duyệt.');
    fixture.componentRef.setInput('value', { latitude: 10, longitude: 106 }); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const open = root.querySelector<HTMLButtonElement>('.location-open')!;
    expect(open.disabled).toBe(false); expect(open.textContent).toContain('Mở bản đồ để xem');
    expect(root.querySelector('.location-lock-reason')!.textContent).toContain('chờ Admin duyệt');
    await component.openMap(); fixture.detectChanges();
    expect(library.map).toHaveBeenCalledOnce();
    expect(library.marker).toHaveBeenCalledWith([10, 106], expect.objectContaining({ draggable: false }));
    expect(root.querySelector('.location-map')!.getAttribute('aria-label')).toContain('chỉ xem');
    mapEvents['click']({ latlng: { lat: 11, lng: 107 } });
    marker.getLatLng.mockReturnValue({ lat: 11, lng: 107 }); markerEvents['dragend']();
    component.manualForm.setValue({ latitude: '11', longitude: '107' }); component.applyCoordinates();
    expect(selected).not.toHaveBeenCalled(); expect(root.querySelector('fieldset')!.disabled).toBe(true);
  });

  it('shows a tile failure with manual fallback and retries by cleaning up the old map', async () => {
    const component = render(); await component.openMap();
    tileEvents['tileerror'](); fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')!.textContent).toContain('Không tải được bản đồ');
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLDivElement>('.location-map')!.hidden).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#salon-latitude')!.disabled).toBe(false);
    await component.openMap(); fixture.detectChanges();
    expect(map.remove).toHaveBeenCalledOnce(); expect(tiles.off).toHaveBeenCalled();
    expect(library.map).toHaveBeenCalledTimes(2); expect(component.mapError()).toBe('');
  });

  it('allows retry after an import failure and ignores imports completing after destroy', async () => {
    loader.load.mockRejectedValueOnce(new Error('chunk unavailable'));
    const component = render(); await component.openMap(); expect(component.mapError()).toContain('Không mở được bản đồ');
    let resolve!: (library: unknown) => void;
    loader.load.mockReturnValueOnce(new Promise(value => { resolve = value; }));
    const pending = component.openMap(); fixture.destroy(); resolve(library); await pending;
    expect(library.map).not.toHaveBeenCalled();
  });

  it('does not import Leaflet or request tiles during SSR', async () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const component = render(); await component.openMap();
    expect(loader.load).not.toHaveBeenCalled(); expect(component.mapOpen()).toBe(false);
  });

  it('cleans map, marker, tile listeners and Leaflet DOM when leaving the page', async () => {
    const component = render(); fixture.componentRef.setInput('value', { latitude: 0, longitude: 0 }); fixture.detectChanges();
    await component.openMap(); fixture.destroy();
    expect(marker.off).toHaveBeenCalled(); expect(tiles.off).toHaveBeenCalled(); expect(map.off).toHaveBeenCalled(); expect(map.remove).toHaveBeenCalledOnce();
  });
});

describe('Leaflet loader server safety', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('refuses library initialization on the server', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
    await expect(TestBed.inject(LeafletMapService).load()).rejects.toThrow('trình duyệt');
  });
});
