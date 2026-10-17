import { Component, inject, effect, OnInit, OnDestroy, signal, PLATFORM_ID, NgZone } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MockDataService } from '../../../services/mock-data.service';
import { SalonCarouselComponent } from '../../../shared/components/salon-carousel/salon-carousel.component';
import { RouterModule } from '@angular/router';
import { RevealOnScrollDirective } from '../../../shared/directives/reveal-on-scroll.directive';
import { SalonApiService } from '../../../services/salon-api.service';
import { Salon } from '../../../models/ellora.model';
import { SalonSearchFormComponent } from '../../../shared/components/salon-search-form/salon-search-form.component';
import { DEFAULT_SEARCH_FILTERS, PublicSalonSearchService, SearchPosition } from '../../../services/public-salon-search.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, SalonCarouselComponent, RevealOnScrollDirective, SalonSearchFormComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class Home implements OnInit, OnDestroy {
  private dataService = inject(MockDataService);
  private salonApi = inject(SalonApiService);
  private platformId = inject(PLATFORM_ID);
  private zone = inject(NgZone);
  readonly search = inject(PublicSalonSearchService);
  private destroyed = false;
  private listVersion = 0;
  private nearbyVersion = 0;
  private scrollFrame = 0;
  private readonly handleScroll = () => {
    if (this.scrollFrame) return;
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = 0;
      const shouldShow = window.scrollY > 360;
      if (this.showBackToTop() !== shouldShow) {
        this.zone.run(() => this.showBackToTop.set(shouldShow));
      }
    });
  };

  salons = signal<Salon[]>([]);
  salonError = signal('');
  readonly salonLoading = signal(true);
  readonly topSalons = signal<Salon[]>([]);
  readonly topLoading = signal(true);
  readonly topError = signal('');
  readonly nearbySalons = signal<Salon[]>([]);
  readonly nearbyLoading = signal(false);
  readonly nearbyError = signal('');
  readonly locationAttempted = signal(false);
  readonly nearbyQuery = { nearby: '1', radiusKm: 5, sort: 'distance' };

  categories = this.dataService.categories;

  showBackToTop = signal(false);

  constructor() { effect(() => { void this.loadNearby(this.search.coordinates()); }); }

  ngOnInit(): void {
    void this.loadSalons();
    if (isPlatformBrowser(this.platformId)) {
      this.zone.runOutsideAngular(() => window.addEventListener('scroll', this.handleScroll, { passive: true }));
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true; this.listVersion++; this.nearbyVersion++;
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('scroll', this.handleScroll);
      if (this.scrollFrame) cancelAnimationFrame(this.scrollFrame);
    }
  }

  async loadSalons(): Promise<void> {
    const version = ++this.listVersion;
    const current = () => !this.destroyed && version === this.listVersion;
    this.salonLoading.set(true); this.topLoading.set(true); this.salonError.set(''); this.topError.set('');
    await Promise.all([
      this.salonApi.search().then(page => { if (current()) this.salons.set(page.content); })
        .catch(() => { if (current()) this.salonError.set('Không tải được danh sách salon. Vui lòng thử lại.'); })
        .finally(() => { if (current()) this.salonLoading.set(false); }),
      this.salonApi.searchFiltered({ sort: 'rating' }, 0, 5).then(page => { if (current()) this.topSalons.set(page.content); })
        .catch(() => { if (current()) this.topError.set('Không tải được salon được đánh giá cao. Vui lòng thử lại.'); })
        .finally(() => { if (current()) this.topLoading.set(false); })
    ]);
  }

  async useNearbyLocation(): Promise<void> { this.locationAttempted.set(true); await this.search.requestLocation(); }
  retryNearby(): void { void this.loadNearby(this.search.coordinates()); }

  private async loadNearby(point: SearchPosition | null): Promise<void> {
    const version = ++this.nearbyVersion;
    this.nearbySalons.set([]); this.nearbyError.set(''); this.nearbyLoading.set(false);
    if (!point || this.destroyed) return;
    this.nearbyLoading.set(true);
    try {
      const options = this.search.apiOptions({ ...DEFAULT_SEARCH_FILTERS, nearby: true, radiusKm: 5, sort: 'distance' });
      const page = await this.salonApi.searchFiltered(options, 0, 8);
      if (!this.destroyed && version === this.nearbyVersion) this.nearbySalons.set(page.content);
    } catch { if (!this.destroyed && version === this.nearbyVersion) this.nearbyError.set('Không tải được salon gần bạn. Vui lòng thử lại.'); }
    finally { if (!this.destroyed && version === this.nearbyVersion) this.nearbyLoading.set(false); }
  }

  scrollToTop(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

}
