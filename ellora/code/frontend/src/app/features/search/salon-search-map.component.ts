import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, PLATFORM_ID, ViewChild, computed, effect, inject, input, signal } from '@angular/core';
import type { Map, Marker, TileLayer } from 'leaflet';
import { Salon } from '../../models/ellora.model';
import { LeafletMapService, validCoordinates } from '../../services/leaflet-map.service';

@Component({
  selector:'app-salon-search-map', standalone:true,
  template:`
    <div class="search-map" [class.search-map--empty]="!points().length">
      <div #canvas class="search-map__canvas" [hidden]="!points().length || !!error()" aria-label="Bản đồ các salon trong trang kết quả"></div>
      @if (!points().length) {
        <div class="search-map__message"><p>Chưa có salon có vị trí bản đồ trong trang kết quả này.</p><p>Bạn vẫn có thể xem địa chỉ và thông tin trong danh sách.</p></div>
      } @else if (error()) {
        <div class="search-map__message"><p role="alert">{{ error() }}</p><button type="button" (click)="loadMap()">Thử lại bản đồ</button></div>
      } @else if (!ready()) {
        <div class="search-map__message"><p role="status">{{ loading() ? 'Đang tải bản đồ…' : 'Xem vị trí các salon trên bản đồ' }}</p>
          @if (!loading()) { <button type="button" (click)="loadMap()">Mở bản đồ</button> }
        </div>
      }
    </div>
    <p class="search-map__caption">Bản đồ hiển thị {{ points().length }} salon có vị trí trong trang kết quả hiện tại. © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a></p>
  `,
  styles:[`
    :host { display:block; min-width:0; }
    .search-map { height:clamp(320px,calc(100dvh - 170px),720px); position:relative; background:#f8f4f6; border:1px solid #eadfe4; border-radius:16px; overflow:hidden; isolation:isolate; z-index:0; }
    .search-map--empty { height:300px; }
    .search-map__canvas { width:100%; height:100%; }
    .search-map__canvas[hidden] { display:none; }
    .search-map__message { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:12px; text-align:center; padding:24px; font-size:14px; line-height:1.6; color:#67525c; }
    p { margin:0; }
    .search-map__caption { margin-top:10px; color:#67525c; font-size:12px; line-height:1.5; }
    a { color:inherit; text-decoration:underline; }
    button { padding:10px 16px; background:#f7bcd5; color:#582a3e; border:1px solid #e6acc3; border-radius:8px; font:inherit; font-weight:600; cursor:pointer; }
    button:focus-visible, a:focus-visible { outline:2px solid #873851; outline-offset:3px; }
    @media(max-width:1023px) { .search-map { height:340px; } }
  `]
})
export class SalonSearchMapComponent implements AfterViewInit, OnDestroy {
  private readonly loader = inject(LeafletMapService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly cdr = inject(ChangeDetectorRef);
  @ViewChild('canvas', { static:true }) private canvas!: ElementRef<HTMLDivElement>;
  readonly salons = input<Salon[]>([]);
  readonly points = computed(() => this.salons().filter(salon => salon.coordinates && validCoordinates({
    latitude:salon.coordinates.lat, longitude:salon.coordinates.lng
  })));
  readonly loading = signal(false);
  readonly ready = signal(false);
  readonly error = signal('');
  private observer?: IntersectionObserver;
  private resizeObserver?: ResizeObserver;
  private map?: Map;
  private tiles?: TileLayer;
  private markers:Marker[] = [];
  private viewReady = false;
  private destroyed = false;
  private generation = 0;

  constructor() { effect(() => { this.salons(); if (this.viewReady) this.observe(); }); }
  ngAfterViewInit():void { this.viewReady = true; this.observe(); }

  private observe():void {
    this.generation++; this.observer?.disconnect(); this.disposeMap();
    this.loading.set(false); this.ready.set(false); this.error.set('');
    if (this.destroyed || !isPlatformBrowser(this.platformId) || !this.points().length || typeof IntersectionObserver === 'undefined') return;
    this.observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { this.observer?.disconnect(); void this.loadMap(); }
    }, { threshold:0.01 });
    this.observer.observe(this.canvas.nativeElement);
  }

  async loadMap():Promise<void> {
    if (this.destroyed || !isPlatformBrowser(this.platformId) || !this.points().length || this.loading() || this.ready() && !this.error()) return;
    this.observer?.disconnect(); this.disposeMap();
    const generation = ++this.generation;
    const salons = this.points();
    this.loading.set(true); this.ready.set(false); this.error.set(''); this.cdr.detectChanges();
    try {
      const library = await this.loader.load();
      if (this.destroyed || generation !== this.generation) return;
      this.map = library.map(this.canvas.nativeElement, { scrollWheelZoom:false });
      this.tiles = library.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom:19, noWrap:true,
        attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      });
      this.tiles.on('tileerror', () => {
        if (!this.destroyed && generation === this.generation) this.error.set('Không tải được bản đồ. Danh sách salon vẫn có thể sử dụng.');
      });
      this.tiles.addTo(this.map);
      const icon = library.divIcon({ className:'salon-location-pin', html:'<span aria-hidden="true">●</span>', iconSize:[30,38], iconAnchor:[15,38] });
      for (const salon of salons) {
        const point = salon.coordinates!;
        const popup = this.document.createElement('div');
        const title = this.document.createElement('strong'); title.textContent = salon.name;
        const address = this.document.createElement('p'); address.textContent = [salon.address,salon.district,salon.city].filter(Boolean).join(', ');
        const link = this.document.createElement('a'); link.href = '/salon/' + encodeURIComponent(salon.id); link.textContent = 'Xem tiệm';
        popup.append(title,address,link);
        this.markers.push(library.marker([point.lat,point.lng], { icon,draggable:false,title:salon.name,alt:salon.name }).bindPopup(popup).addTo(this.map));
      }
      const points = salons.map(salon => [salon.coordinates!.lat,salon.coordinates!.lng] as [number,number]);
      if (points.length === 1) this.map.setView(points[0],15);
      else this.map.fitBounds(library.latLngBounds(points), { padding:[30,30],maxZoom:15 });
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize());
        this.resizeObserver.observe(this.canvas.nativeElement);
      }
      this.ready.set(true);
    } catch {
      if (!this.destroyed && generation === this.generation) { this.disposeMap(); this.error.set('Không mở được bản đồ. Bạn vẫn có thể xem danh sách salon.'); }
    } finally { if (!this.destroyed && generation === this.generation) this.loading.set(false); }
  }

  private disposeMap():void {
    this.resizeObserver?.disconnect(); this.resizeObserver = undefined;
    this.markers.forEach(marker => marker.off()); this.markers = [];
    this.tiles?.off(); this.map?.off(); this.map?.remove(); this.tiles = undefined; this.map = undefined;
  }
  ngOnDestroy():void { this.destroyed = true; this.generation++; this.observer?.disconnect(); this.disposeMap(); }
}
