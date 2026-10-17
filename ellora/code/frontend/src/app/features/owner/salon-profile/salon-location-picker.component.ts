import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, PLATFORM_ID, ViewChild, effect, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { LeafletMouseEvent, Map, Marker, TileLayer } from 'leaflet';
import { LeafletMapService, SalonCoordinates, validCoordinates } from '../../../services/leaflet-map.service';

@Component({
  selector: 'app-salon-location-picker', standalone: true, imports: [ReactiveFormsModule],
  templateUrl: './salon-location-picker.component.html', styleUrl: './salon-location-picker.component.scss'
})
export class SalonLocationPickerComponent implements OnDestroy {
  private readonly loader = inject(LeafletMapService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly cdr = inject(ChangeDetectorRef);
  @ViewChild('mapCanvas', { static: true }) private mapCanvas!: ElementRef<HTMLDivElement>;
  readonly value = input<SalonCoordinates | null>(null);
  readonly disabled = input(false);
  readonly disabledReason = input('Chỉ xem bản đồ. Chức năng chỉnh vị trí hiện đang tạm khóa.');
  readonly selectionChange = output<SalonCoordinates>();
  readonly mapOpen = signal(false);
  readonly loading = signal(false);
  readonly mapError = signal('');
  readonly manualError = signal('');
  readonly manualForm = inject(NonNullableFormBuilder).group({ latitude: ['', Validators.required], longitude: ['', Validators.required] });
  private library?: typeof import('leaflet');
  private map?: Map;
  private marker?: Marker;
  private tiles?: TileLayer;
  private destroyed = false;
  private generation = 0;

  constructor() {
    effect(() => {
      const value = this.value();
      this.manualForm.setValue({ latitude: value ? String(value.latitude) : '', longitude: value ? String(value.longitude) : '' });
      this.manualError.set('');
      if (this.map) this.showSelection(value);
    });
    effect(() => {
      if (this.disabled()) this.marker?.dragging?.disable();
      else this.marker?.dragging?.enable();
    });
  }

  async openMap(): Promise<void> {
    if (this.destroyed || this.loading() || !isPlatformBrowser(this.platformId)) return;
    if (this.map && !this.mapError()) return;
    this.disposeMap();
    const generation = ++this.generation;
    this.mapOpen.set(true); this.loading.set(true); this.mapError.set('');
    this.cdr.detectChanges();
    try {
      const library = await this.loader.load();
      if (this.destroyed || generation !== this.generation) return;
      this.library = library;
      const value = this.value();
      this.map = library.map(this.mapCanvas.nativeElement, {
        center: value ? [value.latitude, value.longitude] : [16.0471, 108.2068], zoom: value ? 16 : 5,
        scrollWheelZoom: false, maxBounds: [[-85.05112878, -180], [85.05112878, 180]], maxBoundsViscosity: 1
      });
      this.tiles = library.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, noWrap: true,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      });
      this.tiles.on('tileerror', () => {
        if (!this.destroyed && generation === this.generation) this.mapError.set(this.disabled() ? 'Không tải được bản đồ. Vui lòng thử lại.' : 'Không tải được bản đồ. Bạn có thể thử lại hoặc nhập tọa độ bên dưới.');
      });
      this.tiles.addTo(this.map);
      this.map.on('click', (event: LeafletMouseEvent) => this.select({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
      this.showSelection(value);
    } catch {
      if (!this.destroyed && generation === this.generation) {
        this.disposeMap(); this.mapError.set(this.disabled() ? 'Không mở được bản đồ. Vui lòng thử lại.' : 'Không mở được bản đồ. Bạn có thể thử lại hoặc nhập tọa độ bên dưới.');
      }
    } finally { if (!this.destroyed && generation === this.generation) this.loading.set(false); }
  }

  applyCoordinates(): void {
    if (this.disabled() || this.destroyed) return;
    this.manualForm.markAllAsTouched();
    const raw = this.manualForm.getRawValue();
    const value = { latitude: Number(raw.latitude.trim()), longitude: Number(raw.longitude.trim()) };
    if (!raw.latitude.trim() || !raw.longitude.trim() || !validCoordinates(value)) {
      this.manualError.set('Nhập đủ vĩ độ từ -90 đến 90 và kinh độ từ -180 đến 180.'); return;
    }
    this.manualError.set(''); this.select(value);
  }

  private select(value: SalonCoordinates): void {
    if (this.disabled() || this.destroyed || !validCoordinates(value)) return;
    const selected = { latitude: Number(value.latitude.toFixed(6)), longitude: Number(value.longitude.toFixed(6)) };
    this.manualForm.setValue({ latitude: String(selected.latitude), longitude: String(selected.longitude) });
    this.manualError.set(''); this.showSelection(selected); this.selectionChange.emit(selected);
  }

  private showSelection(value: SalonCoordinates | null): void {
    if (!this.map || !this.library) return;
    if (!validCoordinates(value)) { this.marker?.off(); this.marker?.remove(); this.marker = undefined; return; }
    const point: [number, number] = [value.latitude, value.longitude];
    if (this.marker) this.marker.setLatLng(point);
    else {
      this.marker = this.library.marker(point, {
        draggable: !this.disabled(), keyboard: true, title: 'Vị trí tiệm', alt: 'Ghim vị trí tiệm',
        icon: this.library.divIcon({ className: 'salon-location-pin', html: '<span aria-hidden="true">●</span>', iconSize: [30, 38], iconAnchor: [15, 38] })
      }).addTo(this.map);
      this.marker.on('dragend', () => {
        const point = this.marker!.getLatLng(); this.select({ latitude: point.lat, longitude: point.lng });
      });
    }
    this.map.setView(point, Math.max(this.map.getZoom(), 16));
  }

  private disposeMap(): void {
    this.marker?.off(); this.tiles?.off(); this.map?.off(); this.map?.remove();
    this.marker = undefined; this.tiles = undefined; this.map = undefined;
  }

  ngOnDestroy(): void { this.destroyed = true; this.generation++; this.disposeMap(); }
}
