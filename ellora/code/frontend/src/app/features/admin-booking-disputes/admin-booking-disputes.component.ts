import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Clipboard } from '@angular/cdk/clipboard';
import { Component, ElementRef, inject, OnDestroy, OnInit, PLATFORM_ID, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminBookingDispute, AdminBookingDisputesApiService, BookingDisputeOutcome, BookingDisputeStatus } from '../../services/admin-booking-disputes-api.service';
import { BookingStatus } from '../../services/booking-api.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-booking-disputes.component.html',
  styleUrls: ['../admin-content/admin-page.scss', './admin-booking-disputes.component.scss']
})
export class AdminBookingDisputesComponent implements OnInit, OnDestroy {
  private readonly api = inject(AdminBookingDisputesApiService);
  private readonly clipboard = inject(Clipboard);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly caseHeading = viewChild<ElementRef<HTMLElement>>('caseHeading');
  readonly cases = signal<AdminBookingDispute[]>([]);
  readonly selected = signal<AdminBookingDispute | null>(null);
  readonly selectedId = signal<number | null>(null);
  readonly loading = signal(false);
  readonly detailLoading = signal(false);
  readonly resolving = signal(false);
  readonly error = signal(''); readonly detailError = signal(''); readonly resolutionError = signal('');
  readonly message = signal(''); readonly copyFeedback = signal(''); readonly copyFailed = signal(false);
  readonly page = signal(0); readonly last = signal(true); readonly total = signal(0);
  filter: BookingDisputeStatus | '' = 'OPEN';
  note = ''; outcome: BookingDisputeOutcome = 'UPHELD';
  readonly statusLabels: Record<BookingDisputeStatus, string> = { OPEN: 'Chờ xử lý', UPHELD: 'Giữ hoàn thành', REOPENED: 'Đã trả về thực hiện' };
  readonly bookingLabels: Record<BookingStatus, string> = {
    PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', IN_PROGRESS: 'Đang thực hiện',
    COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy', REJECTED: 'Đã từ chối'
  };
  private listRequest = 0;
  private detailRequest = 0;
  private destroyed = false;

  ngOnInit(): void { void this.load(); }
  ngOnDestroy(): void { this.destroyed = true; this.listRequest++; this.detailRequest++; }
  private failure(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'Bạn không có quyền xử lý phản ánh này.';
      if (typeof error.error?.message === 'string') return error.error.message;
    }
    return 'Không thực hiện được. Vui lòng thử lại.';
  }
  async load(page = 0): Promise<void> {
    if (this.resolving() || this.destroyed) return;
    const request = ++this.listRequest; this.detailRequest++;
    this.selected.set(null); this.selectedId.set(null); this.detailLoading.set(false);
    this.note = ''; this.outcome = 'UPHELD'; this.detailError.set(''); this.resolutionError.set(''); this.copyFeedback.set('');
    this.loading.set(true); this.error.set('');
    try {
      const result = await this.api.list(this.filter, Math.max(0, page));
      if (request !== this.listRequest || this.destroyed) return;
      this.cases.set(result.content); this.page.set(result.pageNumber); this.total.set(result.totalElements); this.last.set(result.last);
    } catch (error) {
      if (request !== this.listRequest || this.destroyed) return;
      this.cases.set([]); this.total.set(0); this.last.set(true); this.error.set(this.failure(error));
    } finally { if (request === this.listRequest && !this.destroyed) this.loading.set(false); }
  }
  async openCase(id: number): Promise<void> {
    if (this.resolving() || this.loading() || this.destroyed || this.selected()?.id === id) return;
    const request = ++this.detailRequest;
    this.selectedId.set(id); this.selected.set(null); this.detailLoading.set(true);
    this.note = ''; this.outcome = 'UPHELD'; this.detailError.set(''); this.resolutionError.set(''); this.copyFeedback.set('');
    try {
      const detail = await this.api.detail(id);
      if (request === this.detailRequest && !this.destroyed) {
        this.selected.set(detail);
        if (isPlatformBrowser(this.platformId)) this.caseHeading()?.nativeElement.focus();
      }
    } catch (error) { if (request === this.detailRequest && !this.destroyed) this.detailError.set(this.failure(error)); }
    finally { if (request === this.detailRequest && !this.destroyed) this.detailLoading.set(false); }
  }
  async resolve(): Promise<void> {
    const item = this.selected();
    if (!item || item.status !== 'OPEN' || this.resolving() || this.detailLoading() || this.destroyed) return;
    const note = this.note.trim();
    if (!note || note.length > 2000 || !['UPHELD', 'REOPENED'].includes(this.outcome)) {
      this.resolutionError.set('Nhập kết luận từ 1 đến 2000 ký tự và chọn cách xử lý.'); return;
    }
    const request = ++this.detailRequest; this.listRequest++;
    this.resolving.set(true); this.resolutionError.set(''); this.error.set(''); this.message.set(''); this.copyFeedback.set('');
    try {
      const updated = await this.api.resolve(item.id, this.outcome, note);
      if (request !== this.detailRequest || this.destroyed) return;
      this.selected.set(updated);
      const removed = !!this.filter && updated.status !== this.filter && this.cases().some(row => row.id === updated.id);
      this.cases.update(rows => rows.flatMap(row => row.id !== updated.id ? [row] : this.filter && updated.status !== this.filter ? [] : [updated]));
      if (removed) this.total.update(total => Math.max(0, total - 1));
      this.note = '';
      this.message.set(updated.status === 'REOPENED' ? 'Đã lưu kết luận và trả lịch hẹn về Đang thực hiện.' : 'Đã lưu kết luận và giữ lịch hẹn Hoàn thành.');
      await this.refreshAfterResolution();
    } catch (error) { if (request === this.detailRequest && !this.destroyed) this.resolutionError.set(this.failure(error)); }
    finally { if (request === this.detailRequest && !this.destroyed) this.resolving.set(false); }
  }
  private async refreshAfterResolution(): Promise<void> {
    const request = ++this.listRequest;
    const filter = this.filter;
    this.loading.set(true);
    try {
      let result = await this.api.list(filter, this.page());
      if (request !== this.listRequest || this.destroyed) return;
      if (!result.content.length && this.page() > 0) {
        result = await this.api.list(filter, this.page() - 1);
        if (request !== this.listRequest || this.destroyed) return;
      }
      this.cases.set(result.content); this.page.set(result.pageNumber); this.total.set(result.totalElements); this.last.set(result.last);
    } catch (error) {
      if (request === this.listRequest && !this.destroyed) this.error.set('Đã lưu kết luận, nhưng chưa tải lại được danh sách. Vui lòng bấm Tải lại danh sách. ' + this.failure(error));
    } finally { if (request === this.listRequest && !this.destroyed) this.loading.set(false); }
  }
  contact(value: string | null | undefined): string { return value?.trim() || 'Chưa cung cấp'; }
  salonPhone(item: AdminBookingDispute): string { return item.salonPhone?.trim() || item.ownerPhone?.trim() || ''; }
  formatTime(value: string | null): string {
    if (!value) return 'Chưa có';
    const withOffset = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
    const date = new Date(withOffset ? value : value + 'Z');
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: withOffset ? 'Asia/Ho_Chi_Minh' : 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(date);
  }
  copyPhone(value: string | null | undefined): void {
    if (value?.trim()) this.copy(value.trim(), 'Đã sao chép số điện thoại.');
  }
  copyCase(): void {
    const item = this.selected(); if (!item) return;
    this.copy([
      `Phản ánh #${item.id} · ${this.statusLabels[item.status]}`,
      `Lịch hẹn #${item.bookingId} · Lần hoàn thành ${item.completionVersion} · ${this.bookingLabels[item.bookingStatus]}`,
      `Dịch vụ: ${item.serviceName} · ${item.servicePrice.toLocaleString('vi-VN')} đ · ${item.durationMinutes} phút`,
      `Thời gian: ${this.formatTime(item.scheduledAt)} (giờ Việt Nam)`,
      `Nhân viên: ${this.contact(item.employeeName)}`,
      `Đánh dấu hoàn thành: ${this.formatTime(item.completedAt)}`,
      `Khách hàng: ${this.contact(item.customerName)} · SĐT: ${this.contact(item.customerPhone)} · Email: ${this.contact(item.customerEmail)}`,
      `Tiệm: ${this.contact(item.salonName)} (#${item.salonId}) · SĐT: ${this.contact(item.salonPhone)} · Email: ${this.contact(item.salonEmail)}`,
      `Địa chỉ tiệm: ${this.contact(item.salonAddress)}`,
      `Chủ tiệm: ${this.contact(item.ownerName)} · SĐT: ${this.contact(item.ownerPhone)} · Email: ${this.contact(item.ownerEmail)}`,
      `Lý do: ${item.reason}`,
      `Gửi lúc: ${this.formatTime(item.createdAt)}`,
      `Kết luận: ${item.adminNote || 'Chưa có'}`,
      `Xử lý lúc: ${this.formatTime(item.resolvedAt)} · Admin: ${this.contact(item.resolvedBy)}`
    ].join('\n'), 'Đã sao chép toàn bộ thông tin phản ánh.');
  }
  private copy(text: string, success: string): void {
    let copied = false;
    try { copied = isPlatformBrowser(this.platformId) && this.clipboard.copy(text); } catch { /* Report failure without sending data. */ }
    this.copyFailed.set(!copied); this.copyFeedback.set(copied ? success : 'Không sao chép được. Vui lòng chọn và sao chép thông tin thủ công.');
  }
}
