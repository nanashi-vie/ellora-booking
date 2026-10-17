import { Component, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { BookingApiService, BookingItem, CompletionConfirmation } from '../../../services/booking-api.service';

@Component({
  selector: 'app-my-bookings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './my-bookings.component.html',
  styleUrl: './my-bookings.component.scss'
})
export class MyBookings implements OnInit, OnDestroy {
  private readonly api = inject(BookingApiService);
  activeTab = signal<'all' | 'upcoming' | 'completed'>('all');
  bookings = signal<BookingItem[]>([]);
  page = signal(0);
  hasMore = signal(false);
  loading = signal(false);
  error = signal('');
  readonly completionSaving = signal<number | null>(null);
  readonly completionError = signal('');
  readonly completionSuccess = signal('');
  readonly disputeId = signal<number | null>(null);
  disputeReason = '';
  private disputeVersion: number | null = null;
  private dataVersion = 0;
  private destroyed = false;

  reviewId = signal<number | null>(null);
  reviewSaving = signal(false);
  reviewError = signal('');
  reviewSuccess = signal('');
  rating = 0;
  comment = '';
  private refreshTimer?: ReturnType<typeof setInterval>;
  private readonly refreshOnFocus = () => { if (!document.hidden) void this.load(true, true); };
  private readonly refreshOnVisibility = () => { if (!document.hidden) void this.load(true, true); };

  completionState(booking: BookingItem): CompletionConfirmation {
    return booking.completionConfirmation ?? (booking.reviewed ? 'CONFIRMED' : 'PENDING');
  }
  canRespond(booking: BookingItem): boolean {
    return booking.status === 'COMPLETED' && this.completionState(booking) === 'PENDING';
  }
  canReview(booking: BookingItem): boolean {
    return booking.status === 'COMPLETED' && !booking.reviewed
      && ['CONFIRMED', 'ADMIN_CONFIRMED'].includes(this.completionState(booking));
  }
  openDispute(booking: BookingItem): void {
    if (!this.canRespond(booking) || this.completionSaving() !== null) return;
    if (this.disputeId() !== booking.id || this.disputeVersion !== (booking.completionVersion ?? 0)) this.disputeReason = '';
    this.disputeVersion = booking.completionVersion ?? 0;
    this.disputeId.set(booking.id); this.completionError.set(''); this.completionSuccess.set('');
  }
  async confirmService(booking: BookingItem): Promise<void> { await this.respond(booking, true); }
  async submitDispute(): Promise<void> {
    const booking = this.bookings().find(row => row.id === this.disputeId());
    if (!booking || !this.canRespond(booking) || (booking.completionVersion ?? 0) !== this.disputeVersion) {
      this.completionError.set('Lịch hẹn đã thay đổi. Vui lòng tải lại trước khi gửi phản ánh.'); return;
    }
    const reason = this.disputeReason.trim();
    if (!reason || reason.length > 1000) {
      this.completionError.set('Vui lòng nhập lý do chưa hoàn thành, tối đa 1000 ký tự.'); return;
    }
    await this.respond(booking, false, reason);
  }
  private async respond(booking: BookingItem, completed: boolean, reason?: string): Promise<void> {
    if (!this.canRespond(booking) || this.completionSaving() !== null || this.destroyed) return;
    this.completionSaving.set(booking.id); this.completionError.set(''); this.completionSuccess.set('');
    this.dataVersion++;
    try {
      const updated = await this.api.respondToCompletion(booking.id, { completed, completionVersion: booking.completionVersion ?? 0, ...(reason ? { reason } : {}) });
      if (this.destroyed) return;
      this.bookings.update(rows => rows.map(row => row.id === booking.id ? { ...row, ...updated } : row));
      if (this.disputeId() === booking.id) { this.disputeId.set(null); this.disputeReason = ''; this.disputeVersion = null; }
      this.completionSuccess.set(completed ? 'Bạn đã xác nhận đã sử dụng dịch vụ.' : 'Đã gửi phản ánh đến admin. Kết quả xử lý sẽ hiện tại lịch hẹn này.');
    } catch (error: any) {
      if (!this.destroyed) this.completionError.set(error?.error?.message || 'Chưa gửi được phản hồi. Vui lòng thử lại.');
    } finally { if (!this.destroyed) this.completionSaving.set(null); }
  }

  openReview(booking: BookingItem): void {
    if (this.reviewSaving() || !this.canReview(booking)) return;
    this.reviewId.set(booking.id);
    this.rating = 0; this.comment = '';
    this.reviewError.set(''); this.reviewSuccess.set('');
  }

  async submitReview(): Promise<void> {
    const id = this.reviewId();
    if (id === null || this.reviewSaving()) return;
    const booking = this.bookings().find(row => row.id === id);
    if (!booking || !this.canReview(booking)) { this.reviewError.set('Lịch hẹn chưa đủ điều kiện đánh giá. Vui lòng tải lại.'); return; }
    if (!Number.isInteger(this.rating) || this.rating < 1 || this.rating > 5 || this.comment.length > 1000) {
      this.reviewError.set('Hãy chọn từ 1 đến 5 sao. Nhận xét tối đa 1000 ký tự.'); return;
    }
    this.reviewSaving.set(true); this.reviewError.set(''); this.dataVersion++;
    try {
      await this.api.reviewBooking(id, this.rating, this.comment.trim());
      if (this.destroyed) return;
      this.bookings.update(list => list.map(b => b.id === id ? {...b, reviewed: true} : b));
      this.reviewId.set(null);
      this.reviewSuccess.set('Cảm ơn bạn! Đánh giá đã được đăng trên trang tiệm.');
    } catch (e: any) {
      if (!this.destroyed) this.reviewError.set(e?.error?.message || 'Chưa gửi được đánh giá. Vui lòng thử lại.');
    } finally { if (!this.destroyed) this.reviewSaving.set(false); }
  }


  ngOnInit(): void {
    void this.load(true);
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    window.addEventListener('focus', this.refreshOnFocus);
    document.addEventListener('visibilitychange', this.refreshOnVisibility);
    this.refreshTimer = setInterval(() => {
      if (!document.hidden) void this.load(true, true);
    }, 30000);
  }

  ngOnDestroy(): void {
    this.destroyed = true; this.dataVersion++;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    window.removeEventListener('focus', this.refreshOnFocus);
    document.removeEventListener('visibilitychange', this.refreshOnVisibility);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  async load(reset = false, silent = false): Promise<void> {
    if (this.loading() || this.completionSaving() !== null || this.reviewSaving() || this.destroyed) return;
    if (silent && (this.disputeId() !== null || this.reviewId() !== null)) return;
    const version = this.dataVersion;
    this.loading.set(true);
    if (!silent) this.error.set('');
    try {
      const page = reset ? 0 : this.page() + 1;
      const result = await this.api.getMyBookings(page);
      if (this.destroyed || version !== this.dataVersion) return;
      if (silent && (this.disputeId() !== null || this.reviewId() !== null)) return;
      this.bookings.update(current => reset ? result.content : [...current, ...result.content]);
      this.page.set(page); this.hasMore.set(!result.last);
    } catch { if (!silent && !this.destroyed && version === this.dataVersion) this.error.set('Không tải được lịch sử đặt chỗ. Vui lòng thử lại.'); }
    finally { if (!this.destroyed) this.loading.set(false); }
  }

  async cancel(id: number): Promise<void> {
    this.dataVersion++;
    try {
      await this.api.cancelBooking(id);
      if (this.destroyed) return;
      this.bookings.update(current => current.map(booking => booking.id === id ? { ...booking, status: 'CANCELLED' } : booking));
    } catch { if (!this.destroyed) this.error.set('Không hủy được lịch này. Vui lòng tải lại.'); }
  }

  filteredBookings = computed(() => {
    const currentTab = this.activeTab();
    if (currentTab === 'all') return this.bookings();
    if (currentTab === 'completed') return this.bookings().filter(b => b.status === 'COMPLETED');
    return this.bookings().filter(b => b.status === 'PENDING' || b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS');
  });
}
