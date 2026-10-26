import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { OwnerApiService, OwnerRevenueReport } from '../../../services/owner-api.service';
import { SalonRegistration } from '../../../services/salon-registration.service';
import { PhotoUpload } from '../../../shared/components/photo-upload.component';
import { BookingApiService, BookingItem } from '../../../services/booking-api.service';
import { vnDate } from '../../../services/billing-api.service';

type RevenueGroup = 'day' | 'week' | 'month';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, BaseChartDirective, PhotoUpload],
  // Canvas text does not inherit the page's CSS font.
  providers: [provideCharts(withDefaultRegisterables(), { defaults: { font: { family: 'Inter, system-ui, sans-serif' } } })],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class Dashboard implements OnInit, OnDestroy {
  private readonly owner = inject(OwnerApiService);
  private readonly bookingApi = inject(BookingApiService);
  readonly error = signal('');
  readonly salon = signal<SalonRegistration | null>(null);
  readonly revenueGroup = signal<RevenueGroup>('day');
  readonly revenueLoading = signal(false);
  readonly revenueError = signal('');
  readonly revenuePeriods: { value: RevenueGroup; label: string }[] = [
    { value: 'day', label: 'Ngày' }, { value: 'week', label: 'Tuần' }, { value: 'month', label: 'Tháng' }
  ];
  private revenueRequest = 0;
  private destroyed = false;
  readonly employeeAvatars = signal(new Map<number, string>());
  stats = signal({
    totalBookings: 0,
    revenue: 0,
    monthlyCustomers: 0,
    averageRating: 0,
    upcomingAppointments: 0
  });

  async ngOnInit(): Promise<void> {
    try {
      const [salon, summary] = await Promise.all([this.owner.salon(), this.owner.summary()]);
      if (this.destroyed) return;
      this.salon.set(salon);
      this.stats.set({
        totalBookings: summary.completedBookings,
        revenue: summary.monthlyRevenue ?? 0,
        monthlyCustomers: summary.monthlyCustomers ?? 0,
        averageRating: summary.averageRating ?? 0,
        upcomingAppointments: summary.pendingBookings + summary.confirmedBookings
      });
      void this.loadEmployeeAvatars();
      const today = vnDate();
      const monthStart = `${today.slice(0, 7)}-01`;
      const trendIsMonthlyTotal = this.revenueGroup() !== 'month';
      const [bookings, services, reviews, revenue] = await Promise.all([
        (async () => {
          const items: BookingItem[] = [];
          for (let page = 0; page < 10; page++) {
            const result = await this.bookingApi.getSalonBookings(salon.id, undefined, page, 100);
            items.push(...result.content);
            if (result.last) break;
          }
          return items;
        })(),
        this.owner.services(), this.owner.reviews(0),
        this.loadRevenueTrend()
      ]);
      if (this.destroyed) return;
      const currentMonth = bookings.filter(item => item.status === 'COMPLETED' && item.scheduledAt.slice(0, 10) >= monthStart && item.scheduledAt.slice(0, 10) <= today);
      const monthlyRevenue = summary.monthlyRevenue ?? (trendIsMonthlyTotal ? revenue?.gross : undefined) ?? currentMonth.reduce((sum, item) => sum + (item.servicePrice || 0), 0);
      const monthlyCustomers = summary.monthlyCustomers ?? new Set(currentMonth.map(item => item.customerName)).size;
      const averageRating = summary.averageRating ?? (reviews.content.length
        ? reviews.content.reduce((sum, review) => sum + review.rating, 0) / reviews.content.length
        : 0);
      this.stats.set({
        totalBookings: summary.completedBookings,
        revenue: monthlyRevenue,
        monthlyCustomers,
        averageRating,
        upcomingAppointments: summary.pendingBookings + summary.confirmedBookings
      });
      this.populateCharts(services, currentMonth);
      this.transactions = bookings.slice(0, 8).map(item => ({
        id: `#${item.id}`, customer: item.customerName || 'Khách hàng', phone: item.customerPhone?.trim() || null, service: item.serviceName,
        staff: item.employeeName || 'Chưa phân công', date: item.scheduledAt,
        amount: `${(item.servicePrice || 0).toLocaleString('vi-VN')} ₫`,
        status: item.status === 'COMPLETED' ? 'THÀNH CÔNG' : item.status === 'CANCELLED' || item.status === 'REJECTED' ? 'ĐÃ HỦY' : 'ĐANG XỬ LÝ'
      }));
    } catch { this.error.set('Không tải được dữ liệu tổng quan. Vui lòng kiểm tra kết nối và thử tải lại.'); }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.revenueRequest++;
  }

  private async loadEmployeeAvatars(): Promise<void> {
    try {
      const employees = await this.owner.employees();
      if (!this.destroyed) this.employeeAvatars.set(new Map(employees
        .filter(employee => employee.avatarUrl?.trim())
        .map(employee => [employee.id, employee.avatarUrl!.trim()])));
    } catch { /* Employee initials remain available if portraits cannot be loaded. */ }
  }

  employeePhotoFailed(id: number | null, url: string): void {
    if (id === null || this.employeeAvatars().get(id) !== url) return;
    this.employeeAvatars.update(avatars => { const next = new Map(avatars); next.delete(id); return next; });
  }

  async setRevenueGroup(group: RevenueGroup): Promise<void> {
    if (group === this.revenueGroup() && !this.revenueError()) return;
    this.revenueGroup.set(group);
    await this.loadRevenueTrend();
  }

  async loadRevenueTrend(): Promise<OwnerRevenueReport | null> {
    if (this.destroyed) return null;
    const request = ++this.revenueRequest;
    const group = this.revenueGroup();
    const today = vnDate();
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    const previousEnd = new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
    const from = group === 'month' ? `${year}-01-01` : `${today.slice(0, 7)}-01`;
    const previousFrom = group === 'month' ? `${year - 1}-01-01` : `${previousEnd.slice(0, 7)}-01`;
    const previousTo = group === 'month' ? `${year - 1}-12-31` : previousEnd;
    this.revenueLoading.set(true);
    this.revenueError.set('');
    try {
      const [current, previous] = await Promise.all([
        this.owner.revenue(from, today, group), this.owner.revenue(previousFrom, previousTo, group)
      ]);
      if (request !== this.revenueRequest) return null;
      const length = group === 'month' ? 12 : group === 'week'
        ? Math.max(current.points.length, previous.points.length)
        : Math.max(new Date(Date.UTC(year, month, 0)).getUTCDate(), Number(previousEnd.slice(8, 10)));
      const values = (report: OwnerRevenueReport): (number | null)[] => {
        const result: (number | null)[] = Array(length).fill(null);
        report.points.forEach((point, index) => {
          const bucket = group === 'day' ? Number(point.date.slice(8, 10)) - 1
            : group === 'month' ? Number(point.date.slice(5, 7)) - 1 : index;
          result[bucket] = point.gross;
        });
        return result;
      };
      this.revenueChartData = {
        labels: Array.from({ length }, (_, index) => group === 'week' ? `Tuần ${index + 1}`
          : group === 'month' ? `Tháng ${index + 1}` : `${index + 1}`),
        datasets: [
          { ...this.revenueChartData.datasets[0], data: values(current), label: group === 'month' ? 'Năm nay' : 'Tháng này' },
          { ...this.revenueChartData.datasets[1], data: values(previous), label: group === 'month' ? 'Năm trước' : 'Tháng trước' }
        ]
      };
      return current;
    } catch {
      if (request === this.revenueRequest) this.revenueError.set('Không tải được xu hướng doanh thu. Vui lòng thử lại.');
      return null;
    } finally {
      if (request === this.revenueRequest) this.revenueLoading.set(false);
    }
  }
  async loadSalon(): Promise<void> {
    try { this.salon.set(await this.owner.salon()); }
    catch { this.error.set('Không tải được hồ sơ salon.'); }
  }
  async removeGallery(url: string): Promise<void> {
    try { await this.owner.removeGallery(url); await this.loadSalon(); }
    catch { this.error.set('Không xóa được ảnh salon.'); }
  }

  private populateCharts(services: { id: number; name: string }[], completedThisMonth: BookingItem[]): void {
    const serviceCounts = new Map<number, number>();
    for (const item of completedThisMonth) serviceCounts.set(item.serviceId, (serviceCounts.get(item.serviceId) ?? 0) + 1);
    const topServices = services.map(service => ({ ...service, count: serviceCounts.get(service.id) ?? 0 }))
      .filter(service => service.count > 0).sort((a, b) => b.count - a.count).slice(0, 3);
    this.servicesChartData = { labels: topServices.map(service => service.name), datasets: [{
      data: topServices.map(service => service.count), backgroundColor: ['#8C3A5A', '#F2A4BB', '#D4C4B7'], borderWidth: 0
    }] };
    this.topServices = topServices.map((service, index) => ({ name: service.name, count: service.count,
      color: ['#8C3A5A', '#F2A4BB', '#D4C4B7'][index] }));

    const hourCounts = Array.from({ length: 12 }, () => 0);
    completedThisMonth.forEach(item => { const hour = Number(item.scheduledAt.slice(11, 13)); if (hour >= 8 && hour < 20) hourCounts[hour - 8]++; });
    this.peakHoursChartData = { labels: hourCounts.map((_, index) => `${String(index + 8).padStart(2, '0')}:00`), datasets: [{ data: hourCounts, backgroundColor: '#F2A4BB', borderRadius: 4 }] };

    const staff = new Map<number | null, { name: string; revenue: number; bookings: number }>();
    completedThisMonth.forEach(item => {
      const id = item.employeeId ?? null;
      const name = item.employeeName || 'Chưa phân công';
      const current = staff.get(id) ?? { name, revenue: 0, bookings: 0 };
      current.revenue += item.servicePrice || 0; current.bookings++;
      staff.set(id, current);
    });
    const ranked = [...staff.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 4);
    const maxRevenue = ranked[0]?.[1].revenue || 1;
    this.staffPerformance = ranked.map(([id, values]) => ({ id, name: values.name,
      initials: values.name.trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase(),
      role: `${values.bookings} lịch hoàn tất tháng này`, revenue: `${values.revenue.toLocaleString('vi-VN')} ₫`,
      growth: '', progress: Math.round(values.revenue / maxRevenue * 100) }));
  }

  // Revenue Line Chart
  revenueChartData: ChartConfiguration<'line'>['data'] = {
    labels: [],
    datasets: [
      {
        data: [],
        label: 'Tháng này',
        fill: true,
        tension: 0.4,
        borderColor: '#8C3A5A',
        backgroundColor: 'rgba(140, 58, 90, 0.1)',
        pointBackgroundColor: '#8C3A5A'
      },
      {
        data: [],
        label: 'Tháng trước',
        fill: false,
        tension: 0.4,
        borderColor: '#D4C4B7',
        borderDash: [5, 5],
        pointBackgroundColor: '#D4C4B7'
      }
    ]
  };
  revenueChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, ticks: { callback: value => `${Number(value).toLocaleString('vi-VN')} ₫` } },
      x: { grid: { display: false } }
    }
  };

  // Services Doughnut Chart
  servicesChartData: ChartConfiguration<'doughnut'>['data'] = {
    labels: [],
    datasets: [
      {
        data: [],
        backgroundColor: ['#8C3A5A', '#F2A4BB', '#D4C4B7'],
        borderWidth: 0
      }
    ]
  };
  servicesChartOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: { legend: { display: false } }
  };

  // Peak Hours Bar Chart
  peakHoursChartData: ChartConfiguration<'bar'>['data'] = {
    labels: [],
    datasets: [
      {
        data: [],
        backgroundColor: '#F2A4BB',
        borderRadius: 4
      }
    ]
  };
  peakHoursChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { min: 0, max: 80, ticks: { stepSize: 10 } },
      x: { grid: { display: false } }
    }
  };

  topServices: { name: string; count: number; color: string }[] = [];
  staffPerformance: { id: number | null; name: string; initials: string; role: string; revenue: string; growth: string; progress: number }[] = [];

  transactions: { id: string; customer: string; phone: string | null; service: string; staff: string; date: string; amount: string; status: string }[] = [];
}
