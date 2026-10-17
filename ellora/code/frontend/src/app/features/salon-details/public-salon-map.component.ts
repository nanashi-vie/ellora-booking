import { isPlatformBrowser } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, PLATFORM_ID, ViewChild, computed, effect, inject, input, signal } from '@angular/core';
import type { Map, Marker, TileLayer } from 'leaflet';
import { LeafletMapService, validCoordinates } from '../../services/leaflet-map.service';

@Component({
  selector: 'app-public-salon-map', standalone: true,
  host: { '[hidden]': '!hasCoordinates()' },
  template: `
    <div class="public-salon-map">
      <div #canvas class="public-salon-map__canvas" [hidden]="!!error()" aria-label="Bản đồ vị trí tiệm"></div>
      @if (error()) {
        <div class="public-salon-map__message">
          <p role="alert">{{ error() }}</p>
          <button type="button" (click)="loadMap()">Thử lại</button>
        </div>
      } @else if (!ready()) {
        <div class="public-salon-map__message">
          <p role="status">{{ loading() ? 'Đang tải bản đồ…' : 'Xem vị trí tiệm trên OpenStreetMap' }}</p>
          @if (!loading()) { <button type="button" (click)="loadMap()">Mở bản đồ</button> }
        </div>
      }
    </div>
    <p class="public-salon-map__attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a></p>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    :host([hidden]) { display: none; }
    .public-salon-map { position: relative; width: 100%; height: 230px; overflow: hidden; border-radius: 12px; background: #f8f5f6; isolation: isolate; z-index: 0; }
    .public-salon-map__canvas { width: 100%; height: 100%; }
    .public-salon-map__canvas[hidden] { display: none; }
    .public-salon-map__message { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 16px; text-align: center; color: #53464c; font-size: 14px; line-height: 1.5; }
    p { margin: 0; }
    button { padding: 9px 14px; border: 1px solid #e7bdce; border-radius: 8px; background: #f7dce7; color: #5c2b40; font: inherit; font-weight: 600; cursor: pointer; }
    button:focus-visible, a:focus-visible { outline: 2px solid #8c3a5a; outline-offset: 3px; }
    .public-salon-map__attribution { margin-top: 6px; color: #756b70; font-size: 11px; line-height: 1.5; }
    a { color: inherit; text-decoration: underline; }
    @media (max-width: 480px) { .public-salon-map { height: 210px; } }
  `]
})
export class PublicSalonMapComponent implements AfterViewInit, OnDestroy {
  private readonly loader = inject(LeafletMapService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly cdr = inject(ChangeDetectorRef);
  @ViewChild('canvas', { static: true }) private canvas!: ElementRef<HTMLDivElement>;
  readonly coordinates = input<{ lat: number; lng: number } | null>(null);
  readonly hasCoordinates = computed(() => {
    const point = this.coordinates();
    return point !== null && validCoordinates({ latitude: point.lat, longitude: point.lng });
  });
  readonly loading = signal(false);
  readonly ready = signal(false);
  readonly error = signal('');
  private observer?: IntersectionObserver;
  private map?: Map;
  private marker?: Marker;
  private tiles?: TileLayer;
  private viewReady = false;
  private destroyed = false;
  private generation = 0;

  constructor() {
    effect(() => { this.coordinates(); if (this.viewReady) this.observeLocation(); });
  }

  ngAfterViewInit(): void { this.viewReady = true; this.observeLocation(); }

  private observeLocation(): void {
    this.generation++; this.observer?.disconnect(); this.disposeMap();
    this.loading.set(false); this.ready.set(false); this.error.set('');
    if (this.destroyed || !isPlatformBrowser(this.platformId) || !this.hasCoordinates()) return;
    if (typeof IntersectionObserver === 'undefined') return;
    this.observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { this.observer?.disconnect(); void this.loadMap(); }
    }, { threshold: 0.01 });
    this.observer.observe(this.canvas.nativeElement);
  }

  async loadMap(): Promise<void> {
    if (this.destroyed || !isPlatformBrowser(this.platformId) || !this.hasCoordinates() || this.loading() || this.ready() && !this.error()) return;
    this.observer?.disconnect(); this.disposeMap();
    const generation = ++this.generation;
    const point = this.coordinates()!;
    this.loading.set(true); this.error.set(''); this.ready.set(false);
    this.cdr.detectChanges();
    try {
      const library = await this.loader.load();
      if (this.destroyed || generation !== this.generation) return;
      this.map = library.map(this.canvas.nativeElement, { center: [point.lat, point.lng], zoom: 16, scrollWheelZoom: false });
      this.tiles = library.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, noWrap: true,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      });
      this.tiles.on('tileerror', () => {
        if (!this.destroyed && generation === this.generation) this.error.set('Không tải được bản đồ. Bạn có thể thử lại hoặc chọn Nhận chỉ đường.');
      });
      this.tiles.addTo(this.map);
      this.marker = library.marker([point.lat, point.lng], {
        draggable: false, keyboard: true, title: 'Vị trí của tiệm', alt: 'Vị trí của tiệm',
        icon: library.divIcon({ className: 'salon-location-pin', html: '<span aria-hidden="true">●</span>', iconSize: [30, 38], iconAnchor: [15, 38] })
      }).addTo(this.map);
      this.ready.set(true);
    } catch {
      if (!this.destroyed && generation === this.generation) { this.disposeMap(); this.error.set('Không mở được bản đồ. Bạn có thể thử lại hoặc chọn Nhận chỉ đường.'); }
    } finally { if (!this.destroyed && generation === this.generation) this.loading.set(false); }
  }

  private disposeMap(): void {
    this.marker?.off(); this.tiles?.off(); this.map?.off(); this.map?.remove();
    this.marker = undefined; this.tiles = undefined; this.map = undefined;
  }

  ngOnDestroy(): void { this.destroyed = true; this.generation++; this.observer?.disconnect(); this.disposeMap(); }
}
