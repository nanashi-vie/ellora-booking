import { isPlatformBrowser } from '@angular/common';
import { afterNextRender, Component, computed, inject, Injector, input, OnDestroy, PLATFORM_ID, signal } from '@angular/core';
import { SeasonalService } from '../../../services/seasonal.service';

@Component({
  selector: 'app-seasonal-scene', standalone: true,
  templateUrl: './seasonal-scene.component.html', styleUrl: './seasonal-scene.component.scss'
})
export class SeasonalSceneComponent implements OnDestroy {
  readonly scene = input<'home-border' | 'vip-detail'>('home-border');
  readonly seasons = inject(SeasonalService);
  readonly reducedMotion = signal(true);
  readonly ready = signal(false);
  readonly running = computed(() => this.ready() && !this.reducedMotion() && !this.seasons.paused());
  readonly labels = { spring: 'xuân', summer: 'hè', autumn: 'thu', winter: 'đông' };
  readonly pieces = [
    { x: 1.2, y: 10, size: 24, delay: -5, duration: 23, drift: 8 },
    { x: 97.5, y: 9, size: 22, delay: -16, duration: 26, drift: -10 },
    { x: 2.5, y: 35, size: 18, delay: -11, duration: 21, drift: 10 },
    { x: 96.5, y: 39, size: 26, delay: -3, duration: 25, drift: -8 },
    { x: 1, y: 64, size: 25, delay: -18, duration: 27, drift: 8 },
    { x: 98, y: 68, size: 18, delay: -9, duration: 22, drift: -7 },
    { x: 3, y: 82, size: 18, delay: -7, duration: 24, drift: 7 },
    { x: 95.5, y: 82, size: 22, delay: -20, duration: 28, drift: -6 },
    { x: 3.5, y: 15, size: 15, delay: -12, duration: 26, drift: 5 },
    { x: 95, y: 24, size: 16, delay: -8, duration: 29, drift: -7 },
    { x: 2.8, y: 54, size: 16, delay: -23, duration: 30, drift: 6 },
    { x: 96, y: 58, size: 16, delay: -14, duration: 25, drift: -6 }
  ];
  private query?: MediaQueryList;
  private destroyed = false;
  private readonly onPreference = (event: MediaQueryListEvent) => { if (!this.destroyed) this.reducedMotion.set(event.matches); };

  constructor() {
    const platform = inject(PLATFORM_ID);
    afterNextRender(() => {
      if (this.destroyed || !isPlatformBrowser(platform)) return;
      if (typeof window.matchMedia === 'function') {
        this.query = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.reducedMotion.set(this.query.matches);
        if (typeof this.query.addEventListener === 'function') this.query.addEventListener('change', this.onPreference);
        else this.query.addListener?.(this.onPreference);
      }
      this.ready.set(true);
    }, { injector: inject(Injector) });
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    if (typeof this.query?.removeEventListener === 'function') this.query.removeEventListener('change', this.onPreference);
    else this.query?.removeListener?.(this.onPreference);
  }
}
