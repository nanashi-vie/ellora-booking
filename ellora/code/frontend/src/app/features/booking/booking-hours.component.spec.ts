import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingComponent } from './booking.component';
import { SalonApiService } from '../../services/salon-api.service';
import { BookingApiService } from '../../services/booking-api.service';
import { AuthService } from '../../services/auth.service';

describe('Customer booking hours and closed dates', () => {
  let component: BookingComponent;
  const api = { closedDates: vi.fn() };
  const bookingApi = { createBooking: vi.fn() };
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T03:00:00Z')); vi.resetAllMocks();
    TestBed.configureTestingModule({ providers: [
      { provide: SalonApiService, useValue: api }, { provide: BookingApiService, useValue: bookingApi },
      { provide: ActivatedRoute, useValue: {} }, { provide: Router, useValue: {} }, { provide: AuthService, useValue: {} }
    ] });
    component = TestBed.runInInjectionContext(() => new BookingComponent());
    component.services.set([{ id: '2', name: 'Sơn gel', salonId: '1', description: '', price: 150000, durationMinutes: 60 }]);
    component.selectedServiceIds.set(['2']); component.selectedDate.set('2026-10-12');
    component.workingHours.set([{ dayOfWeek: 'MONDAY', openTime: '09:00:00', closeTime: '19:00:00', closed: false }]);
  });
  afterEach(() => { component.ngOnDestroy(); TestBed.resetTestingModule(); vi.useRealTimers(); });
  const at = (instant: string) => { vi.setSystemTime(new Date(instant)); component.refreshBookingTime(); };
  it('offers half-hour starts only when the complete service fits inside the configured hours', () => {
    expect(component.availableSlots()[0]).toBe('09:00'); expect(component.availableSlots().at(-1)).toBe('18:00');
    expect(component.afternoonSlots()).toContain('18:00'); expect(component.availableSlots()).not.toContain('18:30');
    component.services.update(services => services.map(service => ({ ...service, durationMinutes: 90 })));
    expect(component.availableSlots().at(-1)).toBe('17:30');
  });
  it('offers no slots for dated or recurring closures or unavailable closure data', () => {
    component.closedDates.set(['2026-10-12']); expect(component.availableSlots()).toEqual([]);
    component.closedDates.set([]); component.selectedDate.set('2026-10-13'); expect(component.availableSlots()).toEqual([]);
    component.selectedDate.set('2026-10-12'); component.closuresError.set('offline'); expect(component.availableSlots()).toEqual([]);
  });
  it('clears an existing choice when a refreshed closure makes it unavailable', async () => {
    component.salon.set({ id: '1' } as never); component.selectedTime.set('10:00');
    api.closedDates.mockResolvedValue(['2026-10-12']); await component.loadClosedDates();
    expect(component.selectedDate()).toBeNull(); expect(component.selectedTime()).toBeNull();
  });

  it('accepts an arbitrary customer minute at least an hour ahead while retaining half-hour suggestions', () => {
    at('2026-10-12T03:20:00Z'); // Vietnam 10:20, earliest 11:20.
    expect(component.timeRange()).toEqual({ min: '11:20', max: '18:00' });
    component.selectTime('11:19'); expect(component.selectedTimeValid()).toBe(false);
    component.selectTime('11:20'); expect(component.selectedTimeValid()).toBe(true);
    component.selectTime('11:37'); expect(component.selectedTimeValid()).toBe(true);
    expect(component.availableSlots()).not.toContain('11:37');
    expect(component.availableSlots()[0]).toBe('11:30');
    component.currentStep.set(3); component.nextStep(); expect(component.currentStep()).toBe(4);
  });

  it('rounds the minimum minute upward when the one-hour threshold contains seconds', () => {
    at('2026-10-12T03:20:01Z');
    expect(component.timeRange()!.min).toBe('11:21');
    component.selectTime('11:20'); expect(component.selectedTimeValid()).toBe(false);
    component.selectTime('11:21'); expect(component.selectedTimeValid()).toBe(true);
  });

  it('keeps a custom-minute window even when no half-hour suggestion fits', () => {
    at('2026-10-12T01:21:00Z');
    component.workingHours.set([{ dayOfWeek: 'MONDAY', openTime: '09:00:00', closeTime: '10:30:00', closed: false }]);
    component.services.update(services => services.map(service => ({ ...service, durationMinutes: 65 })));
    expect(component.timeRange()).toEqual({ min: '09:21', max: '09:25' });
    expect(component.availableSlots()).toEqual([]);
    component.selectTime('09:23'); expect(component.selectedTimeValid()).toBe(true);
  });

  it('uses the opening hour for later dates and offers no appointments once today is too late', () => {
    at('2026-10-11T14:00:00Z'); // Vietnam 21:00 Sunday; Monday still starts at 09:00.
    expect(component.timeRange()!.min).toBe('09:00');
    at('2026-10-12T10:01:00Z'); // Vietnam 17:01, earliest 18:01 after the last 18:00 start.
    expect(component.timeRange()).toBeNull();
    expect(component.availableSlots()).toEqual([]);
  });

  it('carries the one-hour rule across midnight using Vietnam dates', () => {
    at('2026-10-11T16:45:00Z'); // Vietnam 23:45 Sunday -> Monday 00:45.
    component.workingHours.set([{ dayOfWeek: 'MONDAY', openTime: '00:00:00', closeTime: '03:00:00', closed: false }]);
    expect(component.earliestBooking()).toEqual({ date: '2026-10-12', time: '00:45' });
    expect(component.timeRange()).toEqual({ min: '00:45', max: '02:00' });
    component.selectTime('00:44'); expect(component.selectedTimeValid()).toBe(false);
    expect(component.calendarDays().find(day => day.fullDate === '2026-10-11')!.isPast).toBe(true);
  });

  it('initializes the calendar in the next year when the threshold crosses New Year', () => {
    at('2026-12-31T16:30:00Z');
    const newComponent = TestBed.runInInjectionContext(() => new BookingComponent());
    expect(newComponent.earliestBooking()).toEqual({ date: '2027-01-01', time: '00:30' });
    expect(newComponent.calendarYear()).toBe(2027); expect(newComponent.calendarMonth()).toBe(0);
    newComponent.ngOnDestroy();
  });

  it('rejects a once-valid time after the customer waits on confirmation', async () => {
    at('2026-10-12T03:20:00Z'); component.selectTime('11:30');
    component.currentStep.set(3); component.nextStep(); expect(component.currentStep()).toBe(4);
    component.salon.set({ id: '1' } as never);
    component.customerForm.patchValue({ fullName: 'Mai', phone: '0901234567' });
    vi.setSystemTime(new Date('2026-10-12T03:31:00Z')); // No manual refresh: submission must recheck.
    await component.confirmBooking();
    expect(bookingApi.createBooking).not.toHaveBeenCalled();
    expect(component.error()).toContain('ít nhất 1 tiếng');
  });

  it('submits a valid arbitrary-minute time to the backend', async () => {
    at('2026-10-12T03:20:00Z'); component.selectTime('11:37');
    component.salon.set({ id: '1' } as never); component.customerForm.patchValue({ fullName: 'Mai', phone: ' 0901234567 ' });
    bookingApi.createBooking.mockResolvedValue({ id: 9 }); await component.confirmBooking();
    expect(bookingApi.createBooking).toHaveBeenCalledWith(expect.objectContaining({ serviceId: 2, scheduledAt: '2026-10-12T11:37:00', customerPhone: '0901234567' }));
  });

  it('does not submit an invalid contact number', async () => {
    at('2026-10-12T03:20:00Z'); component.selectTime('11:37');
    component.salon.set({ id: '1' } as never); component.customerForm.patchValue({ fullName: 'Mai', phone: 'abcdefghij' });
    await component.confirmBooking();
    expect(bookingApi.createBooking).not.toHaveBeenCalled();
    expect(component.error()).toContain('số điện thoại hợp lệ');
  });
});
