import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

export interface SalonCoordinates { latitude: number; longitude: number; }

export function validCoordinates(value: SalonCoordinates | null | undefined): value is SalonCoordinates {
  return !!value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
    && value.latitude >= -90 && value.latitude <= 90 && value.longitude >= -180 && value.longitude <= 180;
}

@Injectable({ providedIn: 'root' })
export class LeafletMapService {
  private readonly platformId = inject(PLATFORM_ID);
  private pending?: Promise<typeof import('leaflet')>;

  load(): Promise<typeof import('leaflet')> {
    if (!isPlatformBrowser(this.platformId)) return Promise.reject(new Error('Bản đồ chỉ mở được trong trình duyệt.'));
    return this.pending ??= this.loadLibrary().catch(error => { this.pending = undefined; throw error; });
  }

  private async loadLibrary(): Promise<typeof import('leaflet')> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        import('leaflet').then(module => {
          const sdk = module as typeof import('leaflet') & { default?: typeof import('leaflet') };
          return sdk.default ?? sdk;
        }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Không tải được thư viện bản đồ.')), 15000); })
      ]);
    } finally { clearTimeout(timer); }
  }
}
