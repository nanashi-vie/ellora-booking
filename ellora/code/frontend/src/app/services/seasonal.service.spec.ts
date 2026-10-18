import { PLATFORM_ID, TransferState } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEASONAL_CLOCK, SEASONAL_MONTH, SeasonalService, seasonForMonth, vietnamMonth } from './seasonal.service';

afterEach(() => TestBed.resetTestingModule());

describe('Seasonal calendar', () => {
  it('maps all twelve months to the documented four seasons', () => {
    expect(Array.from({ length: 12 }, (_, index) => seasonForMonth(index + 1))).toEqual([
      'winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'
    ]);
    expect(() => seasonForMonth(0)).toThrow(RangeError);
    expect(() => seasonForMonth(13)).toThrow(RangeError);
    expect(() => seasonForMonth(3.5)).toThrow(RangeError);
  });

  it('uses the Vietnam month across UTC month, leap-day and year boundaries', () => {
    expect(vietnamMonth(new Date('2028-02-29T16:59:59Z'))).toBe(2);
    expect(vietnamMonth(new Date('2028-02-29T17:00:00Z'))).toBe(3);
    expect(vietnamMonth(new Date('2026-12-31T17:00:00Z'))).toBe(1);
    expect(seasonForMonth(vietnamMonth(new Date('2026-08-31T17:00:00Z')))).toBe('autumn');
  });

  it('captures the clock once per application visit and shares the pause choice', () => {
    const clock = vi.fn(() => new Date('2026-06-10T00:00:00Z'));
    TestBed.configureTestingModule({ providers: [{ provide: SEASONAL_CLOCK, useValue: clock }] });
    const first = TestBed.inject(SeasonalService);
    clock.mockReturnValue(new Date('2026-12-10T00:00:00Z'));
    const nextPage = TestBed.inject(SeasonalService);
    expect(first.season()).toBe('summer');
    expect(nextPage).toBe(first);
    expect(clock).toHaveBeenCalledTimes(1);
    first.toggle(); expect(nextPage.paused()).toBe(true);
    nextPage.toggle(); expect(first.paused()).toBe(false);
  });

  it('transfers the server month so hydration cannot switch season at midnight', () => {
    const transfer = new TransferState();
    TestBed.configureTestingModule({ providers: [
      { provide: PLATFORM_ID, useValue: 'server' }, { provide: TransferState, useValue: transfer },
      { provide: SEASONAL_CLOCK, useValue: () => new Date('2026-08-31T16:59:59Z') }
    ] });
    expect(TestBed.inject(SeasonalService).season()).toBe('summer');
    expect(transfer.get(SEASONAL_MONTH, 0)).toBe(8);
    TestBed.resetTestingModule();
    const clientClock = vi.fn(() => new Date('2026-08-31T17:00:00Z'));
    TestBed.configureTestingModule({ providers: [
      { provide: PLATFORM_ID, useValue: 'browser' }, { provide: TransferState, useValue: transfer },
      { provide: SEASONAL_CLOCK, useValue: clientClock }
    ] });
    expect(TestBed.inject(SeasonalService).season()).toBe('summer');
    expect(clientClock).not.toHaveBeenCalled();
  });

  it('ignores invalid transferred months and takes a valid Vietnam clock value', () => {
    const transfer = new TransferState(); transfer.set(SEASONAL_MONTH, 15);
    TestBed.configureTestingModule({ providers: [
      { provide: TransferState, useValue: transfer }, { provide: SEASONAL_CLOCK, useValue: () => new Date('2026-10-18T00:00:00Z') }
    ] });
    expect(TestBed.inject(SeasonalService).season()).toBe('autumn');
  });
});
