import { AfterViewInit, Component, DestroyRef, ElementRef, OnDestroy, OnInit, PLATFORM_ID, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { SalonApiService, SalonWorkingHour } from '../../services/salon-api.service';
import { ServiceCard } from '../../shared/components/service-card/service-card.component';
import { Review, Salon, Service } from '../../models/ellora.model';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PublicSalonMapComponent } from './public-salon-map.component';
import { SalonSubscriptionBadgeComponent } from '../../shared/components/salon-subscription-badge.component';
import { SeasonalSceneComponent } from '../../shared/components/seasonal-scene/seasonal-scene.component';

@Component({
  selector: 'app-salon-details',
  standalone: true,
  imports: [CommonModule, RouterModule, ServiceCard, PublicSalonMapComponent, SalonSubscriptionBadgeComponent, SeasonalSceneComponent],
  templateUrl: './salon-details.component.html',
  styleUrl: './salon-details.component.scss'
})
export class SalonDetails implements OnInit, AfterViewInit, OnDestroy {
  private salonApi = inject(SalonApiService);
  private route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);
  private titleObserver?: IntersectionObserver;
  private readonly destroyRef = inject(DestroyRef);
  private loadVersion = 0;

  salon = signal<Salon | null>(null);
  workingHours = signal<SalonWorkingHour[]>([]);
  services = signal<Service[]>([]);
  reviews = signal<Review[]>([]);
  error = signal('');
  showStickySummary = signal(false);
  nearbySalons = signal<Salon[]>([]);
  readonly fullAddress = computed(() => {
    const salon = this.salon();
    return this.joinLocation([salon?.address, salon?.district, salon?.city]);
  });
  readonly locationArea = computed(() => {
    const salon = this.salon();
    return this.joinLocation([salon?.district, salon?.city]);
  });
  readonly directionsUrl = computed(() => {
    const salon = this.salon();
    if (!salon) return null;
    const point = salon.coordinates;
    const destination = point ? `${point.lat},${point.lng}` : this.fullAddress();
    return destination ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}` : null;
  });

  private joinLocation(parts: (string | null | undefined)[]): string {
    return [...new Set(parts.map(part => part?.trim()).filter(Boolean))].join(', ');
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const id = params.get('id');
      if (id) void this.load(id);
    });
  }

  private async load(id: string): Promise<void> {
    const version = ++this.loadVersion;
    const current = () => version === this.loadVersion;
    this.salon.set(null); this.services.set([]); this.reviews.set([]); this.selectedServices.set([]);
    this.workingHours.set([]); this.nearbySalons.set([]); this.error.set('');
    this.showStickySummary.set(false); this.titleObserver?.disconnect();
    try {
      await Promise.all([
        this.salonApi.detail(id).then(async salon => {
          if (!current()) return;
          this.salon.set(salon);
          if (isPlatformBrowser(this.platformId)) setTimeout(() => { if (current()) this.observeTitle(); }, 0);
          const point = salon.coordinates;
          const nearby = point
            ? await this.salonApi.searchFiltered({ latitude:point.lat,longitude:point.lng,radiusKm:10,sort:'distance' },0,5)
            : await this.salonApi.search('',0,5);
          if (current()) this.nearbySalons.set(nearby.content.filter(item => item.id !== id).slice(0,4));
        }),
        this.salonApi.services(id).then(services => { if (current()) this.services.set(services); }),
        this.salonApi.reviews(id).then(reviews => { if (current()) this.reviews.set(reviews.content); }),
        this.salonApi.workingHours(id).then(hours => { if (current()) this.workingHours.set(hours); })
      ]);
    } catch { if (current()) this.error.set('Một số thông tin salon chưa tải được. Vui lòng thử lại.'); }
  }

  @ViewChild('salonTitle')
  private salonTitle?: ElementRef<HTMLElement>;

  // Service tabs
  readonly tabs = ['Nổi bật', 'Làm móng tay', 'Nối móng', 'Nghệ thuật làm móng'];
  activeTab = signal('Nổi bật');
  dayLabel(day: string): string {
    return ({ MONDAY: 'Thứ Hai', TUESDAY: 'Thứ Ba', WEDNESDAY: 'Thứ Tư', THURSDAY: 'Thứ Năm',
      FRIDAY: 'Thứ Sáu', SATURDAY: 'Thứ Bảy', SUNDAY: 'Chủ Nhật' } as Record<string, string>)[day] ?? day;
  }

  // Selected services for booking widget
  selectedServices = signal<Service[]>([]);

  filteredServices = computed(() => {
    // For now, "Nổi bật" shows all. Other tabs would filter by category when data supports it.
    return this.services();
  });

  ngAfterViewInit(): void {
    this.observeTitle();
  }

  private observeTitle(): void {
    if (!isPlatformBrowser(this.platformId) || !this.salonTitle?.nativeElement || !window.matchMedia('(min-width: 1024px)').matches) {
      return;
    }

    this.titleObserver?.disconnect();
    this.titleObserver = new IntersectionObserver(
      ([entry]) => {
        this.showStickySummary.set(!entry.isIntersecting && entry.boundingClientRect.top < 96);
      },
      { rootMargin: '-96px 0px 0px 0px', threshold: 0 }
    );
    this.titleObserver.observe(this.salonTitle.nativeElement);
  }

  ngOnDestroy(): void {
    this.loadVersion++;
    this.titleObserver?.disconnect();
  }

  setTab(tab: string): void {
    this.activeTab.set(tab);
  }

  addService(service: Service): void {
    const current = this.selectedServices();
    if (current.some(s => s.id === service.id)) {
      return;
    }
    this.selectedServices.set([service]);
  }

  getOpenStatusText(): string {
    const s = this.salon();
    if (!s) return '';
    return s.isOpen === undefined ? 'Chưa có giờ mở cửa' : s.isOpen ? 'Đang mở cửa' : 'Đã đóng cửa';
  }

  getCloseTimeText(): string {
    return '';
  }

  getRelativeTime(dateString: string): string {
    const now = Date.now();
    const date = new Date(dateString).getTime();
    const diff = now - date;
    const days = Math.floor(diff / 86400000);

    if (days === 0) return 'Hôm nay';
    if (days === 1) return '1 ngày trước';
    if (days < 7) return `${days} ngày trước`;
    if (days < 14) return '1 tuần trước';
    if (days < 30) return `${Math.floor(days / 7)} tuần trước`;
    return `${Math.floor(days / 30)} tháng trước`;
  }
}
