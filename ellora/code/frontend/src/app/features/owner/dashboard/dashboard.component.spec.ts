import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { Dashboard } from './dashboard.component';
import { OwnerApiService } from '../../../services/owner-api.service';
import { BookingApiService, BookingItem } from '../../../services/booking-api.service';
import { vnDate } from '../../../services/billing-api.service';

describe('Owner dashboard loading', () => {
  it('shows summary and starts independent requests before booking history finishes', async () => {
    let finish!: (page: { content: BookingItem[]; last: boolean }) => void;
    const pending = new Promise<{ content: BookingItem[]; last: boolean }>(resolve => { finish = resolve; });
    const owner = {
      salon: vi.fn().mockResolvedValue({ id: 1 }),
      summary: vi.fn().mockResolvedValue({ completedBookings: 12, monthlyRevenue: 500000,
        monthlyCustomers: 3, averageRating: 4.5, pendingBookings: 2, confirmedBookings: 1 }),
      services: vi.fn().mockResolvedValue([]), reviews: vi.fn().mockResolvedValue({ content: [] }),
      revenue: vi.fn().mockResolvedValue({ gross: 500000, points: [] }),
    };
    const bookings = { getSalonBookings: vi.fn().mockReturnValueOnce(pending)
      .mockResolvedValueOnce({ content: [], last: true }) };
    TestBed.configureTestingModule({ providers: [
      { provide: OwnerApiService, useValue: owner }, { provide: BookingApiService, useValue: bookings },
    ] });
    try {
      const component = TestBed.runInInjectionContext(() => new Dashboard());
      const loading = component.ngOnInit();
      for (let i = 0; i < 4; i++) await Promise.resolve();
      expect(component.stats().revenue).toBe(500000);
      expect(component.stats().upcomingAppointments).toBe(3);
      expect(owner.services).toHaveBeenCalledOnce();
      expect(owner.reviews).toHaveBeenCalledOnce();
      expect(owner.revenue).toHaveBeenCalledTimes(2);
      expect(bookings.getSalonBookings).toHaveBeenCalledTimes(1);
      finish({ content: [{ id: 7, customerName: 'Linh', serviceName: 'Sơn gel',
        servicePrice: 100000, status: 'COMPLETED', scheduledAt: vnDate() + 'T10:00:00' } as BookingItem], last: false });
      await loading;
      expect(bookings.getSalonBookings).toHaveBeenLastCalledWith(1, undefined, 1, 100);
      expect(component.transactions[0].id).toBe('#7');
      expect(component.stats().revenue).toBe(500000);
      expect(component.error()).toBe('');
    } finally { TestBed.resetTestingModule(); }
  });
});
