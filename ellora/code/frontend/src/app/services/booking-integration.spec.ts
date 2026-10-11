import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingService } from './booking.service';
import { BookingApiService, BookingItem } from './booking-api.service';
import { OwnerApiService } from './owner-api.service';
import { MyBookings } from '../features/customer/my-bookings/my-bookings.component';

describe('Dev calendar and new booking features', () => {
  const api = { getSalonBookings: vi.fn(), updateBookingStatus: vi.fn(), reviewBooking: vi.fn(), getMyBookings: vi.fn() };
  const owner = { salon: vi.fn() };
  const booking = { id: 9, status: 'PENDING', customerName: 'Khách dev', serviceName: 'Nail', scheduledAt: '2026-09-25T10:30:00', durationMinutes: 60 } as BookingItem;
  beforeEach(() => {
    vi.resetAllMocks(); sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [{ provide: BookingApiService, useValue: api }, { provide: OwnerApiService, useValue: owner }] });
    owner.salon.mockResolvedValue({ id: 42, name: 'Ellora Nail Studio' });
    api.getSalonBookings.mockResolvedValue({ content: [booking], last: true });
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('keeps dev customer names/calendar data and supports the new status sequence', async () => {
    const service = TestBed.inject(BookingService);
    await service.loadSalonBookings();
    expect(service.salonName()).toBe('Ellora Nail Studio');
    expect(owner.salon).toHaveBeenCalledTimes(1);
    expect(service.bookings()[0]).toMatchObject({ customerName: 'Khách dev', startTime: 10.5, duration: 1, status: 'pending' });
    expect(service.pendingCount()).toBe(1);
    await service.startBooking(9); expect(api.updateBookingStatus).toHaveBeenLastCalledWith(9, { status: 'IN_PROGRESS' });
    await service.completeBooking(9); expect(api.updateBookingStatus).toHaveBeenLastCalledWith(9, { status: 'COMPLETED' });
  });
  it('rings once per new booking, stops at 30 seconds and can restart after leaving owner pages', async () => {
    vi.useFakeTimers();
    class AudioMock {
      state = 'running'; currentTime = 0; destination = {};
      resume = vi.fn().mockResolvedValue(undefined); close = vi.fn().mockResolvedValue(undefined);
      createOscillator = () => ({ frequency: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() });
      createGain = () => ({ gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() });
    }
    vi.stubGlobal('AudioContext', AudioMock);
    const service = TestBed.inject(BookingService);
    await service.loadSalonBookings(); await service.enableSound(); expect(service.ringing()).toBe(true);
    await vi.advanceTimersByTimeAsync(30000); expect(service.ringing()).toBe(false);
    await service.loadSalonBookings(); expect(service.ringing()).toBe(false);
    service.start(); await vi.advanceTimersByTimeAsync(5000);
    service.stop(); expect(service.salonName()).toBe('');
    const calls = api.getSalonBookings.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000); expect(api.getSalonBookings).toHaveBeenCalledTimes(calls);
    service.start(); await vi.advanceTimersByTimeAsync(5000); expect(api.getSalonBookings.mock.calls.length).toBeGreaterThan(calls);
  });
  it('ignores a response from a previous owner session after restarting', async () => {
    vi.useFakeTimers();
    let resolveOld!: (value: unknown) => void;
    api.getSalonBookings.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    const service = TestBed.inject(BookingService);
    const oldLoad = service.loadSalonBookings(); await Promise.resolve();
    service.stop(); service.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.bookings()[0].id).toBe(9);
    resolveOld({ content: [{ ...booking, id: 999 }], last: true }); await oldLoad;
    expect(service.bookings()[0].id).toBe(9); expect(service.pendingCount()).toBe(1);
  });
  it('uses the active dev settings page for reviews and retains drafts on failure', async () => {
    const page = TestBed.runInInjectionContext(() => new MyBookings());
    const completed = { ...booking, status: 'COMPLETED', reviewed: false } as BookingItem;
    page.bookings.set([completed]);
    page.openReview(booking); expect(page.reviewId()).toBeNull();
    page.openReview(completed); await page.submitReview(); expect(api.reviewBooking).not.toHaveBeenCalled();
    page.rating = 5; page.comment = ' Tốt ';
    api.reviewBooking.mockRejectedValue(new Error('offline')); await page.submitReview();
    expect(page.comment).toBe(' Tốt '); expect(page.reviewId()).toBe(9);
    api.reviewBooking.mockResolvedValue(undefined); await page.submitReview();
    expect(api.reviewBooking).toHaveBeenLastCalledWith(9, 5, 'Tốt'); expect(page.bookings()[0].reviewed).toBe(true);
    expect(page.reviewId()).toBeNull(); page.openReview(page.bookings()[0]); expect(page.reviewId()).toBeNull();
  });
});
