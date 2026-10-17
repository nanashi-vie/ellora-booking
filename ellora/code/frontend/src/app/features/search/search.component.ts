import { Component, DestroyRef, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SalonCard } from '../../shared/components/salon-card/salon-card.component';
import { SalonApiService } from '../../services/salon-api.service';
import { DEFAULT_SEARCH_FILTERS, PublicSalonSearchService, SearchFilters } from '../../services/public-salon-search.service';
import { Salon } from '../../models/ellora.model';
import { SalonSearchMapComponent } from './salon-search-map.component';
import { SalonSearchFormComponent } from '../../shared/components/salon-search-form/salon-search-form.component';

@Component({
  selector:'app-search', standalone:true,
  imports:[CommonModule,SalonCard,SalonSearchFormComponent,SalonSearchMapComponent],
  templateUrl:'./search.component.html', styleUrl:'./search.component.scss'
})
export class Search implements OnInit, OnDestroy {
  private readonly salonApi = inject(SalonApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly searchState = inject(PublicSalonSearchService);
  readonly filters = this.searchState.filters;
  readonly salons = signal<Salon[]>([]);
  readonly error = signal('');
  readonly loading = signal(false);
  readonly page = signal(0);
  readonly total = signal(0);
  readonly last = signal(true);
  readonly mobileMap = signal(false);
  readonly locationAttempted = signal(false);
  readonly initialized = signal(false);
  readonly needsLocation = computed(() => this.filters().nearby && !this.searchState.coordinates());
  private version = 0;
  private destroyed = false;

  constructor() {
    effect(() => {
      const filters = this.filters(), page = this.page(), point = this.searchState.coordinates();
      if (this.initialized()) void this.load(filters,page,filters.nearby && !point);
    });
  }

  ngOnInit():void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const filters = this.searchState.fromParams(params);
      this.filters.set(filters);
      const page = Number(params.get('page') ?? 0);
      this.page.set(Number.isSafeInteger(page) && page >= 0 ? Math.min(page,10000) : 0);
      this.initialized.set(true);
    });
  }

  private async load(filters:SearchFilters,page:number,needsLocation:boolean):Promise<void> {
    const version = ++this.version;
    this.error.set(''); this.salons.set([]); this.total.set(0); this.last.set(true);
    if (needsLocation) { this.loading.set(false); return; }
    this.loading.set(true);
    try {
      const result = await this.salonApi.searchFiltered(this.searchState.apiOptions(filters),page);
      if (version !== this.version) return;
      this.salons.set(result.content); this.total.set(result.totalElements); this.last.set(result.last);
    } catch (error:any) {
      if (version === this.version) this.error.set(error?.error?.message || (!error?.status && error?.message) || 'Không tải được salon. Vui lòng thử lại.');
    } finally { if (version === this.version) this.loading.set(false); }
  }

  retry():void { void this.load(this.filters(),this.page(),this.needsLocation()); }
  move(delta:number):void {
    if (this.loading() || delta < 0 && this.page() === 0 || delta > 0 && this.last()) return;
    void this.searchState.navigate(this.filters(),Math.max(0,this.page()+delta));
  }
  changeSort(value:string):void {
    if (value === 'rating' || value === 'newest' || value === 'distance') void this.searchState.navigate({ ...this.filters(),sort:value });
  }
  async locate():Promise<void> {
    this.locationAttempted.set(true);
    if (await this.searchState.requestLocation() && !this.destroyed) void this.searchState.navigate({ ...this.filters(),nearby:true,location:'',sort:'distance' });
  }
  clearFilters():void { void this.searchState.navigate({ ...DEFAULT_SEARCH_FILTERS }); }
  ngOnDestroy():void { this.destroyed = true; this.version++; }
}
