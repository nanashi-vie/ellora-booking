import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { apiConfig } from '../../config/api.config';
import { vnDate } from '../../services/billing-api.service';

interface AdminDashboardSummary {
  customers: number;
  activeSalons: number;
  salonsAwaitingApproval: number;
  totalBookings: number;
  completedBookings: number;
  customersWithCompletedBooking: number;
  returningCustomers: number;
  returningCustomerRate: number;
}

interface AdminRevenueReport {
  gross: number;
  fee: number;
  completedBookings: number;
  estimatedBookings: number;
  points: { date: string; gross: number; fee: number; bookings: number }[];
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  providers: [provideCharts(withDefaultRegisterables())],
  styleUrl: '../admin-content/admin-page.scss',
  template: `
    <section class="admin-page">
      <header class="admin-page-header">
        <div>
          <h1>Dashboard admin</h1>
          <p>Tổng quan người dùng, salon và hoạt động đặt lịch.</p>
        </div>
        <button type="button" (click)="load()" [disabled]="loading()">{{ loading() ? 'Đang tải…' : 'Tải lại' }}</button>
      </header>

      @if (error()) { <p role="alert" class="rounded border border-red-200 bg-red-50 p-4 text-red-800">{{ error() }}</p> }
      @if (loading() && !summary()) { <p role="status">Đang tải số liệu…</p> }
      @if (summary(); as data) {
        <section aria-labelledby="revenue-title" class="card">
          <div>
            <h2 id="revenue-title">Doanh thu phí nền tảng</h2>
            <p class="mt-2 text-sm text-charcoal-800/70">Cùng bộ lọc thời gian như báo cáo doanh nghiệp. Phí tính theo ngày lịch hẹn hoàn thành.</p>
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            <button type="button" (click)="preset('day')" [disabled]="revenueLoading()">Hôm nay</button>
            <button type="button" (click)="preset('week')" [disabled]="revenueLoading()">Tuần này</button>
            <button type="button" (click)="preset('month')" [disabled]="revenueLoading()">Tháng này</button>
            <button type="button" (click)="preset('year')" [disabled]="revenueLoading()">Năm nay</button>
          </div>
          <form (ngSubmit)="loadRevenue()" class="actions mt-4">
            <label class="grid gap-1 text-sm">Từ ngày<input type="date" name="from" [(ngModel)]="from" required [disabled]="revenueLoading()" /></label>
            <label class="grid gap-1 text-sm">Đến ngày<input type="date" name="to" [(ngModel)]="to" required [min]="from" [disabled]="revenueLoading()" /></label>
            <label class="grid gap-1 text-sm">Gộp theo<select name="groupBy" [(ngModel)]="groupBy" [disabled]="revenueLoading()"><option value="day">Ngày</option><option value="week">Tuần (thứ Hai)</option><option value="month">Tháng</option><option value="year">Năm</option></select></label>
            <button type="submit" [disabled]="revenueLoading()">{{ revenueLoading() ? 'Đang tải…' : 'Xem báo cáo' }}</button>
          </form>
          @if (revenueError()) { <p role="alert" class="mt-3 text-red-700">{{ revenueError() }}</p> }
          @if (revenueReport(); as revenue) {
            <div class="mt-5 grid gap-4 sm:grid-cols-3">
              <article class="card metric-card"><p class="text-sm text-charcoal-800/70">Tổng giá trị dịch vụ</p><strong class="mt-2 block text-2xl text-charcoal-900">{{ revenue.gross | number:'1.0-0' }} ₫</strong></article>
              <article class="card metric-card"><p class="text-sm text-charcoal-800/70">Phí nền tảng phát sinh</p><strong class="mt-2 block text-2xl text-charcoal-900">{{ revenue.fee | number:'1.0-0' }} ₫</strong></article>
              <article class="card metric-card"><p class="text-sm text-charcoal-800/70">Lịch hoàn thành</p><strong class="mt-2 block text-2xl text-charcoal-900">{{ revenue.completedBookings | number }}</strong></article>
            </div>
            <p class="mt-3 text-sm text-charcoal-800/70">{{ displayFrom | date:'dd/MM/yyyy' }} – {{ displayTo | date:'dd/MM/yyyy' }} · Tỷ lệ phí áp dụng theo chính sách tại thời điểm hoàn thành.</p>
            @if (revenue.estimatedBookings) { <p class="mt-2 text-sm text-charcoal-800/70">{{ revenue.estimatedBookings }} lịch cũ dùng giá hoặc ngày ước tính.</p> }
            @if (!revenue.completedBookings) { <p role="status" class="mt-2 text-sm">Chưa có doanh thu trong khoảng ngày đã chọn.</p> }
            <div class="mt-5 h-72"><canvas baseChart [data]="revenueChartData" [options]="revenueChartOptions" type="bar" role="img" aria-label="Doanh thu dịch vụ và phí nền tảng theo thời gian"></canvas></div>
            <details class="mt-4"><summary class="cursor-pointer">Xem số liệu chi tiết</summary>
              <div class="mt-3 overflow-x-auto"><table class="w-full text-left text-sm"><thead><tr><th class="p-2">Kỳ bắt đầu</th><th class="p-2">Lịch hoàn thành</th><th class="p-2">Doanh thu dịch vụ</th><th class="p-2">Phí nền tảng</th></tr></thead><tbody>
                @for (point of revenue.points; track point.date) { <tr class="border-t border-charcoal-800/10"><td class="p-2">{{ point.date | date:'dd/MM/yyyy' }}</td><td class="p-2">{{ point.bookings | number }}</td><td class="p-2">{{ point.gross | number:'1.0-0' }} ₫</td><td class="p-2">{{ point.fee | number:'1.0-0' }} ₫</td></tr> }
              </tbody></table></div>
            </details>
          }
        </section>

        <section aria-label="Tổng quan hệ thống" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 mb-5">
          <article class="card metric-card"><p class="text-sm text-charcoal-800/70">Khách hàng</p><strong class="mt-2 block text-3xl text-charcoal-900">{{ data.customers | number }}</strong></article>
          <article class="card metric-card"><p class="text-sm text-charcoal-800/70">Salon đang hoạt động</p><strong class="mt-2 block text-3xl text-charcoal-900">{{ data.activeSalons | number }}</strong></article>
          <article class="card metric-card"><p class="text-sm text-charcoal-800/70">Salon chờ duyệt</p><strong class="mt-2 block text-3xl text-charcoal-900">{{ data.salonsAwaitingApproval | number }}</strong></article>
          <article class="card metric-card"><p class="text-sm text-charcoal-800/70">Tổng lịch hẹn</p><strong class="mt-2 block text-3xl text-charcoal-900">{{ data.totalBookings | number }}</strong></article>
          <article class="card metric-card"><p class="text-sm text-charcoal-800/70">Lịch đã hoàn thành</p><strong class="mt-2 block text-3xl text-charcoal-900">{{ data.completedBookings | number }}</strong></article>
        </section>

        <section aria-labelledby="returning-title" class="card">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="returning-title">Khách hàng quay lại</h2>
              <p class="mt-2 max-w-2xl text-sm text-charcoal-800/70">Tính trên toàn bộ dữ liệu: khách có từ 2 lịch hoàn thành trở lên, chia cho khách có ít nhất 1 lịch hoàn thành.</p>
            </div>
            <strong class="text-5xl font-semibold text-[#8C3A5A]">{{ data.returningCustomerRate | number:'1.0-1' }}%</strong>
          </div>
          <div class="mt-6 h-3 overflow-hidden rounded-full bg-[#F9E9EE]" role="meter" [attr.aria-valuenow]="data.returningCustomerRate" aria-valuemin="0" aria-valuemax="100" aria-label="Tỷ lệ khách hàng quay lại">
            <div class="h-full rounded-full bg-[#C76A86] transition-[width]" [style.width.%]="data.returningCustomerRate"></div>
          </div>
          <p class="mt-4 text-sm text-charcoal-800/70"><strong class="text-charcoal-900">{{ data.returningCustomers | number }}</strong> khách quay lại / <strong class="text-charcoal-900">{{ data.customersWithCompletedBooking | number }}</strong> khách đã hoàn thành lịch.</p>
        </section>
      }
    </section>
  `,
})
export class AdminDashboardComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly summary = signal<AdminDashboardSummary | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly revenueReport = signal<AdminRevenueReport | null>(null);
  readonly revenueLoading = signal(false);
  readonly revenueError = signal('');
  from = '';
  to = '';
  groupBy = 'day';
  displayFrom = '';
  displayTo = '';
  revenueChartData: ChartData<'bar'> = { labels: [], datasets: [] };
  revenueChartOptions: ChartOptions<'bar'> = {
    responsive: true, maintainAspectRatio: false,
    scales: { y: { beginAtZero: true, ticks: { callback: value => Number(value).toLocaleString('vi-VN') + ' ₫' } } },
    plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: context => `${context.dataset.label}: ${Number(context.raw).toLocaleString('vi-VN')} ₫` } } },
  };

  ngOnInit() { void this.load(); this.preset('month'); }

  async load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const response = await firstValueFrom(this.http.get<{ data: AdminDashboardSummary }>(`${apiConfig.baseUrl}/admin/dashboard`));
      this.summary.set(response.data);
    } catch {
      this.error.set('Không tải được dashboard. Kiểm tra quyền admin và thử tải lại.');
    } finally {
      this.loading.set(false);
    }
  }

  private format(date: Date) {
    return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, '0'), String(date.getUTCDate()).padStart(2, '0')].join('-');
  }

  preset(period: string) {
    const today = new Date(vnDate() + 'T00:00:00Z');
    const start = new Date(today);
    this.to = this.format(today);
    if (period === 'week') start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    if (period === 'month') start.setUTCDate(1);
    if (period === 'year') start.setUTCMonth(0, 1);
    this.from = this.format(start);
    this.groupBy = period === 'year' ? 'month' : 'day';
    void this.loadRevenue();
  }

  async loadRevenue() {
    if (this.revenueLoading()) return;
    if (!this.from || !this.to || this.from > this.to) {
      this.revenueError.set('Chọn ngày bắt đầu không lớn hơn ngày kết thúc.');
      return;
    }
    this.revenueLoading.set(true);
    this.revenueError.set('');
    this.revenueReport.set(null);
    try {
      const result = await firstValueFrom(this.http.get<{ data: AdminRevenueReport }>(`${apiConfig.baseUrl}/admin/dashboard/revenue`, {
        params: { from: this.from, to: this.to, groupBy: this.groupBy },
      }));
      this.revenueReport.set(result.data);
      this.displayFrom = this.from;
      this.displayTo = this.to;
      this.revenueChartData = { labels: result.data.points.map(point => point.date), datasets: [
        { label: 'Doanh thu dịch vụ', data: result.data.points.map(point => point.gross), backgroundColor: '#8c3a5a' },
        { label: 'Phí nền tảng', data: result.data.points.map(point => point.fee), backgroundColor: '#e9a052' },
      ] };
    } catch {
      this.revenueError.set('Không tải được báo cáo doanh thu. Kiểm tra ngày đã chọn và thử lại.');
    } finally {
      this.revenueLoading.set(false);
    }
  }
}
