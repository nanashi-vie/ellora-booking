import { isPlatformServer } from '@angular/common';
import { inject, Injectable, InjectionToken, makeStateKey, PLATFORM_ID, signal, TransferState } from '@angular/core';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASONAL_CLOCK = new InjectionToken<() => Date>('Seasonal clock', { providedIn: 'root', factory: () => () => new Date() });
export const SEASONAL_MONTH = makeStateKey<number>('ellora-seasonal-vn-month');

export function vietnamMonth(date: Date): number {
  return Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Ho_Chi_Minh', month: 'numeric' }).format(date));
}
export function seasonForMonth(month: number): Season {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('Month must be between 1 and 12');
  return month >= 3 && month <= 5 ? 'spring' : month >= 6 && month <= 8 ? 'summer' : month >= 9 && month <= 11 ? 'autumn' : 'winter';
}

@Injectable({ providedIn: 'root' })
export class SeasonalService {
  readonly paused = signal(false);
  private readonly month = (() => {
    const transfer = inject(TransferState), transferred = transfer.get(SEASONAL_MONTH, 0);
    const month = Number.isInteger(transferred) && transferred >= 1 && transferred <= 12 ? transferred : vietnamMonth(inject(SEASONAL_CLOCK)());
    if (isPlatformServer(inject(PLATFORM_ID))) transfer.set(SEASONAL_MONTH, month);
    return month;
  })();
  readonly season = signal<Season>(seasonForMonth(this.month)).asReadonly();
  toggle(): void { this.paused.update(paused => !paused); }
}
