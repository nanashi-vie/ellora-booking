import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { ParamMap, Router } from '@angular/router';
import { SalonSearchOptions } from './salon-api.service';

export interface SearchFilters {
  keyword: string;
  location: string;
  date: string;
  time: string;
  nearby: boolean;
  radiusKm: number;
  sort: 'newest' | 'rating' | 'distance';
}
export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  keyword: '', location: '', date: '', time: '', nearby: false, radiusKm: 5, sort: 'newest'
};
export interface SearchPosition { lat: number; lng: number; accuracy?: number; }

@Injectable({ providedIn: 'root' })
export class PublicSalonSearchService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  readonly filters = signal<SearchFilters>({ ...DEFAULT_SEARCH_FILTERS });
  readonly coordinates = signal<SearchPosition | null>(null);
  readonly locating = signal(false);
  readonly error = signal('');
  private generation = 0;
  private pending?: Promise<boolean>;

  fromParams(params: ParamMap): SearchFilters {
    const nearby = params.get('nearby') === '1' || params.get('sort') === 'distance';
    const radius = Number(params.get('radiusKm') ?? 5);
    const sort = params.get('sort');
    return {
      keyword: params.get('keyword') ?? '', location: nearby ? '' : params.get('location') ?? '',
      date: params.get('date') ?? '', time: params.get('time') ?? '', nearby,
      radiusKm: Number.isFinite(radius) && radius > 0 && radius <= 100 ? radius : 5,
      sort: sort === 'rating' ? 'rating' : nearby && sort !== 'newest' ? 'distance' : 'newest'
    };
  }

  async navigate(filters: SearchFilters, page = 0): Promise<boolean> {
    const value = { ...filters, keyword: filters.keyword.trim(), location: filters.location.trim() };
    if (!value.nearby) {
      this.clearLocation();
      if (value.sort === 'distance') value.sort = 'newest';
    } else value.location = '';
    this.filters.set(value);
    const extras = { queryParams: {
      keyword: value.keyword || undefined, location: value.location || undefined,
      date: value.date || undefined, time: value.time || undefined,
      nearby: value.nearby ? '1' : undefined, radiusKm: value.nearby ? value.radiusKm : undefined,
      sort: value.sort === 'newest' ? undefined : value.sort, page: page > 0 ? page : undefined
    } };
    const navigated = await this.router.navigate(['/search'], extras);
    return navigated || this.router.isActive(this.router.createUrlTree(['/search'], extras), {
      paths:'exact', queryParams:'exact', fragment:'ignored', matrixParams:'ignored'
    });
  }

  apiOptions(filters: SearchFilters): SalonSearchOptions {
    const options: SalonSearchOptions = {
      keyword: filters.keyword, location: filters.location, date: filters.date, time: filters.time, sort: filters.sort
    };
    if (filters.nearby) {
      const point = this.coordinates();
      if (!point) throw new Error('Hãy dùng vị trí của bạn hoặc tìm theo khu vực.');
      options.latitude = point.lat; options.longitude = point.lng; options.radiusKm = filters.radiusKm;
    }
    return options;
  }

  clearLocation(): void {
    this.generation++;
    this.coordinates.set(null); this.error.set(''); this.locating.set(false);
  }

  requestLocation(): Promise<boolean> {
    if (this.pending && this.locating()) return this.pending;
    if (!isPlatformBrowser(this.platformId) || typeof navigator === 'undefined' || !navigator.geolocation) {
      this.error.set('Thiết bị chưa hỗ trợ định vị. Bạn có thể nhập khu vực để tìm tiệm.');
      return Promise.resolve(false);
    }
    const generation = ++this.generation;
    this.locating.set(true); this.error.set('');
    const request = new Promise<boolean>(resolve => {
      let settled = false;
      const finish = (point: SearchPosition | null, message = '') => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (generation !== this.generation) { resolve(false); return; }
        this.locating.set(false); this.coordinates.set(point); this.error.set(message);
        resolve(point !== null);
      };
      const timer = setTimeout(() => finish(null, 'Định vị mất quá lâu. Hãy thử lại hoặc nhập khu vực.'), 12000);
      try {
        navigator.geolocation.getCurrentPosition(position => {
          const { latitude: lat, longitude: lng, accuracy } = position.coords;
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            finish(null, 'Chưa xác định được vị trí. Bạn có thể nhập khu vực để tìm tiệm.'); return;
          }
          finish({ lat, lng, ...(Number.isFinite(accuracy) && accuracy >= 0 ? { accuracy } : {}) });
        }, error => finish(null, error.code === 1
          ? 'Bạn chưa cho phép định vị. Hãy bật quyền vị trí hoặc nhập khu vực để tìm tiệm.'
          : error.code === 3 ? 'Định vị mất quá lâu. Hãy thử lại hoặc nhập khu vực.'
          : 'Chưa xác định được vị trí. Hãy thử lại hoặc nhập khu vực.'),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
      } catch { finish(null, 'Không dùng được định vị. Hãy kiểm tra quyền vị trí hoặc nhập khu vực.'); }
    });
    this.pending = request;
    void request.finally(() => { if (this.pending === request) this.pending = undefined; });
    return request;
  }
}
