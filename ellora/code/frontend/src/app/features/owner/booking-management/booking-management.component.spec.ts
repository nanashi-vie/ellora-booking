import { PLATFORM_ID, signal } from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingManagement } from './booking-management.component';
import { BookingEvent, BookingService } from '../../../services/booking.service';
import { OwnerApiService } from '../../../services/owner-api.service';

describe('Owner day and week appointment calendar', () => {
  let fixture: ComponentFixture<BookingManagement>;
  let component: BookingManagement;
  let root: HTMLElement;
  const bookings = signal<BookingEvent[]>([]);
  const focusedBookingId = signal<number | null>(null);
  const bookingService = {
    bookings, focusedBookingId, error: signal(''),
    loadSalonBookings: vi.fn(), isUpdating: vi.fn(),
    acceptBooking: vi.fn(), rejectBooking: vi.fn(), startBooking: vi.fn(), completeBooking: vi.fn(), addCreatedBooking: vi.fn()
  };
  const owner = { services: vi.fn(), employees: vi.fn(), workingHours: vi.fn() };
  const clipboard = { copy: vi.fn() };
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  const scrollIntoView = vi.fn();
  const booking = (id: number, date: string, startTime = 9, staffId = 1, status: BookingEvent['status'] = 'pending'): BookingEvent => ({
    id, date, startTime, staffId, status, duration: 1, inProgress: false,
    customerName: `Khách ${id}`, customerPhone: '0901234567', serviceName: 'Sơn gel'
  });
  const control = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`[data-testid="${id}"]`)!;
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); fixture.detectChanges(); };

  beforeEach(async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-17T20:30:00Z')); // Already Sunday in Vietnam.
    vi.resetAllMocks(); bookings.set([]); focusedBookingId.set(null); bookingService.error.set('');
    bookingService.loadSalonBookings.mockResolvedValue(undefined); bookingService.isUpdating.mockReturnValue(false);
    for (const action of [bookingService.acceptBooking, bookingService.rejectBooking, bookingService.startBooking, bookingService.completeBooking]) action.mockResolvedValue(true);
    owner.services.mockResolvedValue([]);
    owner.employees.mockResolvedValue([
      { id: 1, fullName: 'Hà', phone: '', bio: 'Thợ nail', active: true },
      { id: 2, fullName: 'Linh', phone: '', bio: 'Thợ nail', active: true }
    ]);
    owner.workingHours.mockResolvedValue([{ dayOfWeek: 'MONDAY', openTime: '09:00:00', closeTime: '19:00:00', closed: false }]);
    clipboard.copy.mockReturnValue(true);
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, writable: true, value: scrollIntoView });
    await TestBed.configureTestingModule({ imports: [BookingManagement], providers: [
      { provide: BookingService, useValue: bookingService }, { provide: OwnerApiService, useValue: owner },
      { provide: Clipboard, useValue: clipboard }, { provide: PLATFORM_ID, useValue: 'browser' }
    ] }).compileComponents();
    fixture = TestBed.createComponent(BookingManagement); component = fixture.componentInstance; root = fixture.nativeElement;
    fixture.detectChanges(); await flush();
  });
  afterEach(() => {
    fixture.destroy(); TestBed.resetTestingModule();
    if (originalScrollIntoView) HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
    vi.clearAllTimers(); vi.useRealTimers();
  });

  it('starts on the Vietnam date and navigates days across year and leap-day boundaries', () => {
    expect(component.selectedDate()).toBe('2026-10-18'); expect(component.viewMode()).toBe('day');
    component.setDate('2026-12-31'); component.navigatePeriod(1); expect(component.selectedDate()).toBe('2027-01-01');
    component.navigatePeriod(-1); expect(component.selectedDate()).toBe('2026-12-31');
    component.setDate('2028-02-28'); component.navigatePeriod(1); expect(component.selectedDate()).toBe('2028-02-29');
    component.navigatePeriod(1); expect(component.selectedDate()).toBe('2028-03-01');
    component.navigatePeriod(-1); expect(component.selectedDate()).toBe('2028-02-29');
  });

  it('shows Monday through Sunday and moves a complete week across month and year boundaries', () => {
    component.setDate('2026-11-01'); component.setView('week');
    expect(component.weekDays().map(day => day.date)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    component.setDate('2027-01-01');
    expect(component.weekDays()).toHaveLength(7);
    expect(component.weekDays()[0].date).toBe('2026-12-28'); expect(component.weekDays()[6].date).toBe('2027-01-03');
    component.navigatePeriod(1); expect(component.selectedDate()).toBe('2027-01-08');
    expect(component.weekDays()[0].date).toBe('2027-01-04');
    component.navigatePeriod(-1); expect(component.selectedDate()).toBe('2027-01-01');
    component.goToday(); expect(component.selectedDate()).toBe('2026-10-18');
  });

  it('ignores cleared, malformed and impossible dates while accepting a real leap day', () => {
    component.setDate('2026-10-19');
    for (const value of ['', 'not-a-date', '2026-02-30', '2026-13-01', '2026-2-03']) {
      component.setDate(value); expect(component.selectedDate()).toBe('2026-10-19');
    }
    component.setDate('2028-02-29'); expect(component.selectedDate()).toBe('2028-02-29');
  });

  it('filters the active list to the selected day or week and keeps simultaneous employee appointments', () => {
    bookings.set([
      booking(13, '2026-10-19', 10), booking(12, '2026-10-19', 9, 2), booking(11, '2026-10-19', 9),
      booking(20, '2026-10-20', 8), booking(25, '2026-10-25', 18),
      booking(18, '2026-10-18'), booking(26, '2026-10-26'),
      booking(30, '2026-10-19', 8, 1, 'cancelled'), booking(31, '2026-10-19', 8, 1, 'completed')
    ]);
    component.setDate('2026-10-19');
    expect(component.activeBookings()).toHaveLength(3);
    expect(component.activeBookings().map(row => row.startTime)).toEqual([9, 9, 10]);
    expect(new Set(component.activeBookings().slice(0, 2).map(row => row.id))).toEqual(new Set([11, 12]));
    expect(component.getBookingsForStaff(1).map(row => row.id)).toEqual([11, 13]);
    expect(component.getBookingsForStaff(2).map(row => row.id)).toEqual([12]);
    expect(component.getBookingsForDate('2026-10-19').map(row => row.startTime)).toEqual([9, 9, 10]);
    component.setView('week');
    expect(component.activeBookings()).toHaveLength(5);
    expect(component.activeBookings().map(row => row.date)).toEqual(['2026-10-19', '2026-10-19', '2026-10-19', '2026-10-20', '2026-10-25']);
    component.openDay('2026-10-20'); expect(component.viewMode()).toBe('day');
    expect(component.activeBookings().map(row => row.id)).toEqual([20]);
  });

  it('connects the real date picker, period navigation, view tabs and each week header', () => {
    component.setDate('2026-10-19'); fixture.detectChanges();
    const picker = control<HTMLInputElement>('calendar-date-picker');
    expect(picker.type).toBe('date'); expect(picker.value).toBe('2026-10-19');
    expect(control('calendar-day-tab').getAttribute('aria-pressed')).toBe('true');
    control('calendar-next').click(); fixture.detectChanges(); expect(component.selectedDate()).toBe('2026-10-20');
    control('calendar-prev').click(); fixture.detectChanges(); expect(component.selectedDate()).toBe('2026-10-19');
    picker.value = '2026-10-23'; picker.dispatchEvent(new Event('change', { bubbles: true })); fixture.detectChanges();
    expect(component.selectedDate()).toBe('2026-10-23');
    control('calendar-week-tab').click(); fixture.detectChanges();
    expect(control('calendar-week-tab').getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelectorAll('[data-testid^="week-column-"]')).toHaveLength(7);
    expect(root.textContent).toContain(component.currentDate());
    control('week-day-2026-10-21').click(); fixture.detectChanges();
    expect(component.viewMode()).toBe('day'); expect(component.selectedDate()).toBe('2026-10-21');
    control('calendar-today').click(); fixture.detectChanges(); expect(picker.value).toBe('2026-10-18');
  });

  it('renders weekly contact details, keeps concurrent cards and preserves status actions', () => {
    bookings.set([booking(11, '2026-10-19', 9), booking(12, '2026-10-19', 9, 2, 'confirmed')]);
    component.setDate('2026-10-19'); component.setView('week'); fixture.detectChanges();
    const column = control('week-column-2026-10-19');
    expect(column.textContent).toContain('Khách 11'); expect(column.textContent).toContain('Khách 12');
    expect(column.textContent).toContain('Hà'); expect(column.textContent).toContain('Linh');
    expect(column.querySelectorAll('app-booking-contact')).toHaveLength(2); expect(column.textContent).toContain('0901234567');
    const phoneCopy = column.querySelector<HTMLButtonElement>('[aria-label="Sao chép số điện thoại của Khách 11"]')!;
    phoneCopy.click(); expect(clipboard.copy).toHaveBeenCalledWith('0901234567');
    column.querySelector<HTMLButtonElement>('#booking-11 [aria-label="Xác nhận lịch"]')!.click();
    column.querySelector<HTMLButtonElement>('#booking-11 [aria-label="Từ chối lịch"]')!.click();
    column.querySelector<HTMLButtonElement>('#booking-12 [aria-label="Bắt đầu thực hiện"]')!.click();
    column.querySelector<HTMLButtonElement>('#booking-12 [aria-label="Hoàn thành lịch"]')!.click();
    expect(bookingService.acceptBooking).toHaveBeenCalledWith(11); expect(bookingService.rejectBooking).toHaveBeenCalledWith(11);
    expect(bookingService.startBooking).toHaveBeenCalledWith(12); expect(bookingService.completeBooking).toHaveBeenCalledWith(12);
    expect(control('week-column-2026-10-20').textContent).toMatch(/chưa|không/i);
  });

  it('shows the admin conclusion for a reopened appointment in the list and calendar', () => {
    bookings.set([{ ...booking(11, '2026-10-19', 9, 1, 'confirmed'), inProgress: true, completionConfirmation: 'REOPENED', completionAdminNote: 'Tiếp tục phần móng còn thiếu.' }]);
    component.setDate('2026-10-19'); fixture.detectChanges();
    expect(root.querySelector('details')!.textContent).toContain('Tiếp tục phần móng còn thiếu.');
    expect(root.querySelector('#booking-11')!.textContent).toContain('Tiếp tục phần móng còn thiếu.');
    expect(root.querySelector('#booking-11 [aria-label="Bắt đầu thực hiện"]')).toBeNull();
    expect(root.querySelector('#booking-11 [aria-label="Hoàn thành lịch"]')).not.toBeNull();
  });

  it('opens a notified booking on its actual future date before scrolling', async () => {
    bookings.set([booking(99, '2026-11-03', 10)]); component.setView('week');
    focusedBookingId.set(99); fixture.detectChanges(); await flush();
    expect(component.selectedDate()).toBe('2026-11-03'); expect(component.viewMode()).toBe('day');
    await vi.advanceTimersByTimeAsync(150); fixture.detectChanges();
    expect(root.querySelector('#booking-99')).not.toBeNull(); expect(scrollIntoView).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500); fixture.detectChanges();
    expect(focusedBookingId()).toBeNull();
  });

  it('keeps a notification selection until its booking loads and cancels scheduled focus on destroy', async () => {
    focusedBookingId.set(99); fixture.detectChanges(); await flush();
    expect(focusedBookingId()).toBe(99);
    bookings.set([booking(99, '2026-11-03', 10)]); fixture.detectChanges(); await flush();
    expect(component.selectedDate()).toBe('2026-11-03');
    fixture.destroy(); await vi.advanceTimersByTimeAsync(2000);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it.each(['cancelled', 'completed'] as const)('does not keep reopening an inactive %s notification after polling', async status => {
    component.setDate('2026-10-19'); component.setView('week');
    bookings.set([booking(99, '2026-11-03', 10, 1, status)]); focusedBookingId.set(99);
    fixture.detectChanges(); await flush();
    expect(focusedBookingId()).toBeNull(); expect(component.selectedDate()).toBe('2026-10-19');
    expect(component.viewMode()).toBe('week');
    component.navigatePeriod(1);
    bookings.set([booking(99, '2026-11-03', 10, 1, status)]); fixture.detectChanges(); await flush();
    expect(component.selectedDate()).toBe('2026-10-26'); expect(component.viewMode()).toBe('week');
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
