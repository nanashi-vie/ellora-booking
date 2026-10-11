import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { OwnerApiService } from '../../../services/owner-api.service';
import { SalonRegistration } from '../../../services/salon-registration.service';
import { PhotoUpload } from '../../../shared/components/photo-upload.component';
import { BookingApiService, BookingItem } from '../../../services/booking-api.service';
import { vnDate } from '../../../services/billing-api.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, BaseChartDirective, PhotoUpload],
  providers: [provideCharts(withDefaultRegisterables())],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class Dashboard implements OnInit {
  private readonly owner = inject(OwnerApiService);
  private readonly bookingApi = inject(BookingApiService);
  readonly error = signal('');
  readonly salon = signal<SalonRegistration | null>(null);
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
      this.salon.set(salon);
      this.stats.set({
        totalBookings: summary.completedBookings,
        revenue: summary.monthlyRevenue ?? 0,
        monthlyCustomers: summary.monthlyCustomers ?? 0,
        averageRating: summary.averageRating ?? 0,
        upcomingAppointments: summary.pendingBookings + summary.confirmedBookings
      });
      const today = vnDate();
      const monthStart = `${today.slice(0, 7)}-01`;
      const previousStartDate = new Date(`${monthStart}T00:00:00`);
      previousStartDate.setMonth(previousStartDate.getMonth() - 1);
      const previousStart = `${previousStartDate.getFullYear()}-${String(previousStartDate.getMonth() + 1).padStart(2, '0')}-01`;
      const previousEndDate = new Date(`${monthStart}T00:00:00`);
      previousEndDate.setDate(0);
      const previousEnd = `${previousEndDate.getFullYear()}-${String(previousEndDate.getMonth() + 1).padStart(2, '0')}-${String(previousEndDate.getDate()).padStart(2, '0')}`;
      const [bookings, services, reviews, revenue, previousRevenue] = await Promise.all([
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
        this.owner.revenue(monthStart, today).catch(() => null),
        this.owner.revenue(previousStart, previousEnd).catch(() => null)
      ]);
      const currentMonth = bookings.filter(item => item.status === 'COMPLETED' && item.scheduledAt.slice(0, 10) >= monthStart && item.scheduledAt.slice(0, 10) <= today);
      const monthlyRevenue = summary.monthlyRevenue ?? revenue?.gross ?? currentMonth.reduce((sum, item) => sum + (item.servicePrice || 0), 0);
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
      this.populateCharts(bookings, services, currentMonth, revenue?.points ?? [], previousRevenue?.points ?? []);
      this.transactions = bookings.slice(0, 8).map(item => ({
        id: `#${item.id}`, customer: item.customerName || 'Khách hàng', service: item.serviceName,
        staff: item.employeeName || 'Chưa phân công', date: item.scheduledAt,
        amount: `${(item.servicePrice || 0).toLocaleString('vi-VN')} ₫`,
        status: item.status === 'COMPLETED' ? 'THÀNH CÔNG' : item.status === 'CANCELLED' || item.status === 'REJECTED' ? 'ĐÃ HỦY' : 'ĐANG XỬ LÝ'
      }));
    } catch { this.error.set('Không tải được dữ liệu tổng quan. Vui lòng kiểm tra kết nối và thử tải lại.'); }
  }
  async loadSalon(): Promise<void> {
    try { this.salon.set(await this.owner.salon()); }
    catch { this.error.set('Không tải được hồ sơ salon.'); }
  }
  async removeGallery(url: string): Promise<void> {
    try { await this.owner.removeGallery(url); await this.loadSalon(); }
    catch { this.error.set('Không xóa được ảnh salon.'); }
  }

  private populateCharts(bookings: BookingItem[], services: { id: number; name: string }[], completedThisMonth: BookingItem[], currentRevenue: { date: string; gross: number }[], previousRevenue: { date: string; gross: number }[]): void {
    const today = new Date(`${vnDate()}T00:00:00`);
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const previousMonth = new Date(currentYear, currentMonth - 1, 1);
    const days = new Date(currentYear, currentMonth + 1, 0).getDate();
    const previousDays = new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 0).getDate();
    const currentValues = Array.from({ length: days }, (_, index) => 0);
    const previousValues = Array.from({ length: previousDays }, (_, index) => 0);
    currentRevenue.forEach(point => { const day = Number(point.date.slice(8, 10)); if (day > 0 && day <= days) currentValues[day - 1] = point.gross; });
    previousRevenue.forEach(point => { const day = Number(point.date.slice(8, 10)); if (day > 0 && day <= days) previousValues[day - 1] = point.gross; });
    this.revenueChartData = { labels: Array.from({ length: days }, (_, index) => `${index + 1}`), datasets: [
      { ...this.revenueChartData.datasets[0], data: currentValues, label: 'Tháng này' },
      { ...this.revenueChartData.datasets[1], data: Array.from({ length: days }, (_, index) => previousValues[index] ?? 0), label: 'Tháng trước' }
    ] };

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

    const staff = new Map<string, { revenue: number; bookings: number }>();
    completedThisMonth.forEach(item => {
      const name = item.employeeName || 'Chưa phân công';
      const current = staff.get(name) ?? { revenue: 0, bookings: 0 };
      current.revenue += item.servicePrice || 0; current.bookings++;
      staff.set(name, current);
    });
    const ranked = [...staff.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 4);
    const maxRevenue = ranked[0]?.[1].revenue || 1;
    this.staffPerformance = ranked.map(([name, values]) => ({ name, role: `${values.bookings} lịch hoàn tất tháng này`,
      revenue: `${values.revenue.toLocaleString('vi-VN')} ₫`, growth: '', progress: Math.round(values.revenue / maxRevenue * 100), avatar: '/salon-placeholder.svg' }));
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
  staffPerformance: { name: string; role: string; revenue: string; growth: string; progress: number; avatar: string }[] = [];

  transactions: { id: string; customer: string; service: string; staff: string; date: string; amount: string; status: string }[] = [];
}
