import { Directive } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BaseChartDirective } from 'ng2-charts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './dashboard.component';
import { BookingApiService, BookingItem } from '../../../services/booking-api.service';
import { OwnerApiService, OwnerEmployee } from '../../../services/owner-api.service';

@Directive({ selector: 'canvas[baseChart]', standalone: true, inputs: ['data', 'options', 'type'] })
class ChartStub { data: unknown; options: unknown; type: unknown; }

describe('Owner dashboard customer phones and real employee portraits', () => {
  let fixture: ComponentFixture<Dashboard>;
  const owner = { salon: vi.fn(), summary: vi.fn(), services: vi.fn(), reviews: vi.fn(), revenue: vi.fn(), employees: vi.fn() };
  const bookingApi = { getSalonBookings: vi.fn() };
  const employees = [
    { id: 10, fullName: 'Nguyễn Linh', active: true, avatarUrl: ' /portraits/linh-10.jpg ' },
    { id: 20, fullName: 'Nguyễn Linh', active: false, avatarUrl: '/portraits/linh-20.jpg' },
    { id: 30, fullName: 'Chưa có ảnh', active: true, avatarUrl: '  ' }
  ] as OwnerEmployee[];
  const booking = (id: number, employeeId: number | undefined, servicePrice: number, customerPhone?: string): BookingItem => ({
    id, employeeId, servicePrice, customerPhone, customerName: `Khách ${id}`, employeeName: employeeId ? 'Nguyễn Linh' : undefined,
    salonId: 1, salonName: 'Ellora', serviceId: 2, serviceName: 'Sơn gel', durationMinutes: 60,
    scheduledAt: '2026-10-18T10:00:00', status: 'COMPLETED', createdAt: '2026-10-17T10:00:00'
  });
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); fixture.detectChanges(); };
  const render = async () => {
    fixture = TestBed.createComponent(Dashboard); fixture.detectChanges(); await flush();
    return { component: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
  };

  beforeEach(async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-18T03:00:00Z')); vi.resetAllMocks();
    owner.salon.mockResolvedValue({ id: 1, imageUrls: [] });
    owner.summary.mockResolvedValue({ completedBookings: 4, monthlyRevenue: 400000, monthlyCustomers: 3, averageRating: 4.5, pendingBookings: 1, confirmedBookings: 2 });
    owner.services.mockResolvedValue([{ id: 2, name: 'Sơn gel' }]); owner.reviews.mockResolvedValue({ content: [] });
    owner.revenue.mockResolvedValue({ gross: 400000, points: [] }); owner.employees.mockResolvedValue(employees);
    bookingApi.getSalonBookings.mockResolvedValue({ content: [
      booking(1, 10, 200000, ' 0900123456 '), booking(2, 20, 150000, '  '), booking(3, undefined, 50000),
      { ...booking(4, 10, 999000, '0912345678'), scheduledAt: '2026-09-30T10:00:00' }
    ], last: true });
    TestBed.configureTestingModule({ imports: [Dashboard], providers: [
      { provide: OwnerApiService, useValue: owner }, { provide: BookingApiService, useValue: bookingApi }
    ] });
    TestBed.overrideComponent(Dashboard, { remove: { imports: [BaseChartDirective] }, add: { imports: [ChartStub] } });
    await TestBed.compileComponents();
  });
  afterEach(() => { fixture?.destroy(); TestBed.resetTestingModule(); vi.useRealTimers(); });

  it('keeps same-name employees and their totals separate, including inactive staff and an unassigned bucket', async () => {
    const { component } = await render();
    expect(component.staffPerformance.map(staff => ({ id: staff.id, name: staff.name, revenue: staff.revenue }))).toEqual([
      { id: 10, name: 'Nguyễn Linh', revenue: '200.000 ₫' },
      { id: 20, name: 'Nguyễn Linh', revenue: '150.000 ₫' },
      { id: null, name: 'Chưa phân công', revenue: '50.000 ₫' }
    ]);
    expect(component.employeeAvatars().get(10)).toBe('/portraits/linh-10.jpg');
    expect(component.employeeAvatars().get(20)).toBe('/portraits/linh-20.jpg');
    expect(component.employeeAvatars().has(30)).toBe(false);
    expect(component.transactions.map(row => row.phone)).toEqual(['0900123456', null, null, '0912345678']);
  });

  it('renders actual employee images and transaction phones, with initials after an image fails', async () => {
    const { component, root } = await render();
    const images = Array.from(root.querySelectorAll<HTMLImageElement>('img[alt="Ảnh của Nguyễn Linh"]'));
    expect(images.map(image => image.getAttribute('src'))).toEqual(['/portraits/linh-10.jpg', '/portraits/linh-20.jpg']);
    expect(images[0].getAttribute('width')).toBe('40'); expect(images[0].getAttribute('height')).toBe('40'); expect(images[0].getAttribute('loading')).toBe('lazy');
    expect(images[0].parentElement!.parentElement!.textContent).toContain('200.000 ₫');
    expect(images[1].parentElement!.parentElement!.textContent).toContain('150.000 ₫');
    expect(root.querySelector('tbody')!.textContent).toContain('0900123456');
    expect(root.querySelector('tbody')!.textContent).toContain('Chưa có SĐT');
    const staffRow = images[0].parentElement!;
    images[0].dispatchEvent(new Event('error')); fixture.detectChanges();
    expect(staffRow.textContent).toContain('NL'); expect(component.employeeAvatars().has(10)).toBe(false);
    expect(component.employeeAvatars().get(20)).toBe('/portraits/linh-20.jpg');
    component.employeeAvatars.update(photos => new Map(photos).set(20, '/portraits/new-20.jpg'));
    component.employeePhotoFailed(20, '/portraits/linh-20.jpg');
    expect(component.employeeAvatars().get(20)).toBe('/portraits/new-20.jpg');
  });

  it('finishes dashboard data while photos are pending and displays them when they arrive', async () => {
    let resolvePhotos!: (value: OwnerEmployee[]) => void;
    owner.employees.mockReturnValueOnce(new Promise<OwnerEmployee[]>(resolve => { resolvePhotos = resolve; }));
    const { component, root } = await render();
    expect(component.transactions).toHaveLength(4); expect(component.stats().revenue).toBe(400000);
    expect(component.staffPerformance).toHaveLength(3); expect(component.revenueLoading()).toBe(false);
    expect(component.employeeAvatars().size).toBe(0); expect(component.error()).toBe('');
    const chart = component.revenueChartData;
    resolvePhotos(employees); await flush();
    expect(root.querySelectorAll('img[alt="Ảnh của Nguyễn Linh"]')).toHaveLength(2);
    expect(component.revenueChartData).toBe(chart); expect(component.transactions).toHaveLength(4);
  });

  it('uses initials and keeps transactions when the employee photo directory fails', async () => {
    owner.employees.mockRejectedValueOnce(new Error('photos unavailable'));
    const { component, root } = await render();
    expect(component.transactions).toHaveLength(4); expect(component.employeeAvatars().size).toBe(0); expect(component.error()).toBe('');
    expect(root.querySelectorAll('img[alt="Ảnh của Nguyễn Linh"]')).toHaveLength(0);
    expect(component.staffPerformance[0].initials).toBe('NL'); expect(component.staffPerformance[1].initials).toBe('NL');
    expect(root.textContent).toContain('NL');
  });

  it('ignores employee photos that arrive after leaving the dashboard', async () => {
    let resolvePhotos!: (value: OwnerEmployee[]) => void;
    owner.employees.mockReturnValueOnce(new Promise<OwnerEmployee[]>(resolve => { resolvePhotos = resolve; }));
    const { component } = await render(); fixture.destroy();
    resolvePhotos(employees); for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(component.employeeAvatars().size).toBe(0); expect(component.error()).toBe('');
  });
});
