import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './dashboard.component';
import { OwnerApiService, OwnerRevenueReport } from '../../../services/owner-api.service';
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
      employees: vi.fn().mockResolvedValue([]),
    };
    const bookings = { getSalonBookings: vi.fn().mockReturnValueOnce(pending)
      .mockResolvedValueOnce({ content: [], last: true }) };
    TestBed.configureTestingModule({ providers: [
      { provide: OwnerApiService, useValue: owner }, { provide: BookingApiService, useValue: bookings },
    ] });
    try {
      const component = TestBed.runInInjectionContext(() => new Dashboard());
      const loading = component.ngOnInit();
      for (let i = 0; i < 8; i++) await Promise.resolve();
      expect(component.stats().revenue).toBe(500000);
      expect(component.stats().upcomingAppointments).toBe(3);
      expect(owner.services).toHaveBeenCalledOnce();
      expect(owner.reviews).toHaveBeenCalledOnce();
      expect(owner.revenue).toHaveBeenCalledTimes(2);
      expect(component.revenueChartData.labels!.length).toBeGreaterThan(0);
      expect(component.revenueLoading()).toBe(false);
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

function report(points: { date: string; gross: number }[] = []): OwnerRevenueReport {
  return { gross: points.reduce((sum, point) => sum + point.gross, 0), fee: 0, net: 0,
    completedBookings: 0, estimatedBookings: 0,
    points: points.map(point => ({ ...point, fee: 0, net: point.gross, bookings: 1 })) };
}

describe('Owner revenue trend periods', () => {
  let component: Dashboard;
  const owner = { revenue: vi.fn() };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-11T03:00:00Z'));
    owner.revenue.mockReset().mockResolvedValue(report());
    TestBed.configureTestingModule({ providers: [
      { provide: OwnerApiService, useValue: owner }, { provide: BookingApiService, useValue: {} }
    ] });
    component = TestBed.runInInjectionContext(() => new Dashboard());
  });
  afterEach(() => {
    component.ngOnDestroy();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('aligns daily revenue without dropping the previous month’s 31st day or inventing future revenue', async () => {
    owner.revenue.mockResolvedValueOnce(report([{ date: '2026-04-01', gross: 100 }, { date: '2026-04-11', gross: 0 }]))
      .mockResolvedValueOnce(report([{ date: '2026-03-01', gross: 200 }, { date: '2026-03-31', gross: 300 }]));
    await component.loadRevenueTrend();
    expect(owner.revenue.mock.calls).toEqual([
      ['2026-04-01', '2026-04-11', 'day'], ['2026-03-01', '2026-03-31', 'day']
    ]);
    expect(component.revenueChartData.labels).toHaveLength(31);
    expect(component.revenueChartData.datasets[0].data[0]).toBe(100);
    expect(component.revenueChartData.datasets[0].data[10]).toBe(0);
    expect(component.revenueChartData.datasets[0].data[11]).toBeNull();
    expect(component.revenueChartData.datasets[0].data[30]).toBeNull();
    expect(component.revenueChartData.datasets[1].data[30]).toBe(300);
  });

  it('uses backend Monday-based weekly totals, including weeks starting before the month', async () => {
    owner.revenue.mockResolvedValueOnce(report([{ date: '2026-03-30', gross: 120 }, { date: '2026-04-06', gross: 340 }]))
      .mockResolvedValueOnce(report([{ date: '2026-02-23', gross: 10 }, { date: '2026-03-02', gross: 20 },
        { date: '2026-03-09', gross: 30 }, { date: '2026-03-16', gross: 40 },
        { date: '2026-03-23', gross: 50 }, { date: '2026-03-30', gross: 60 }]));
    await component.setRevenueGroup('week');
    expect(owner.revenue.mock.calls).toEqual([
      ['2026-04-01', '2026-04-11', 'week'], ['2026-03-01', '2026-03-31', 'week']
    ]);
    expect(component.revenueChartData.labels).toEqual(['Tuần 1', 'Tuần 2', 'Tuần 3', 'Tuần 4', 'Tuần 5', 'Tuần 6']);
    expect(component.revenueChartData.datasets[0].data).toEqual([120, 340, null, null, null, null]);
    expect(component.revenueChartData.datasets[1].data).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it('compares monthly totals across calendar years and handles January rollover', async () => {
    vi.setSystemTime(new Date('2026-01-02T03:00:00Z'));
    owner.revenue.mockResolvedValueOnce(report([{ date: '2026-01-01', gross: 500 }]))
      .mockResolvedValueOnce(report([{ date: '2025-01-01', gross: 700 }, { date: '2025-12-01', gross: 900 }]));
    await component.setRevenueGroup('month');
    expect(owner.revenue.mock.calls).toEqual([
      ['2026-01-01', '2026-01-02', 'month'], ['2025-01-01', '2025-12-31', 'month']
    ]);
    expect(component.revenueChartData.labels).toHaveLength(12);
    expect(component.revenueChartData.labels![11]).toBe('Tháng 12');
    expect(component.revenueChartData.datasets[0].label).toBe('Năm nay');
    expect(component.revenueChartData.datasets[1].label).toBe('Năm trước');
    expect(component.revenueChartData.datasets[0].data[1]).toBeNull();
    expect(component.revenueChartData.datasets[1].data[11]).toBe(900);
    await component.setRevenueGroup('day');
    expect(owner.revenue).toHaveBeenLastCalledWith('2025-12-01', '2025-12-31', 'day');
    expect(component.revenueChartData.datasets[0].label).toBe('Tháng này');
  });

  it('uses the leap year’s February boundary', async () => {
    vi.setSystemTime(new Date('2024-03-01T03:00:00Z'));
    await component.loadRevenueTrend();
    expect(owner.revenue).toHaveBeenLastCalledWith('2024-02-01', '2024-02-29', 'day');
  });

  it('keeps the latest period when an older request finishes later', async () => {
    let finish!: (value: OwnerRevenueReport) => void;
    owner.revenue.mockReturnValueOnce(new Promise<OwnerRevenueReport>(resolve => { finish = resolve; }));
    const older = component.loadRevenueTrend();
    expect(component.revenueLoading()).toBe(true);
    await component.setRevenueGroup('month');
    const latest = component.revenueChartData;
    finish(report([{ date: '2026-04-01', gross: 999 }]));
    await older;
    expect(component.revenueGroup()).toBe('month');
    expect(component.revenueChartData).toBe(latest);
    expect(component.revenueLoading()).toBe(false);
    expect(component.revenueError()).toBe('');
  });

  it('reports a failed comparison and can retry the selected period', async () => {
    owner.revenue.mockRejectedValueOnce(new Error('offline'));
    await component.setRevenueGroup('week');
    expect(component.revenueError()).not.toBe('');
    expect(component.revenueLoading()).toBe(false);
    await component.setRevenueGroup('week');
    expect(owner.revenue).toHaveBeenCalledTimes(4);
    expect(component.revenueError()).toBe('');
    await component.setRevenueGroup('week');
    expect(owner.revenue).toHaveBeenCalledTimes(4);
  });

  it('ignores pending revenue after leaving the dashboard', async () => {
    let finish!: (value: OwnerRevenueReport) => void;
    owner.revenue.mockReturnValueOnce(new Promise<OwnerRevenueReport>(resolve => { finish = resolve; }));
    const loading = component.loadRevenueTrend();
    component.ngOnDestroy();
    finish(report([{ date: '2026-04-01', gross: 100 }]));
    await loading;
    expect(component.revenueChartData.labels).toEqual([]);
    expect(component.revenueError()).toBe('');
  });
});
