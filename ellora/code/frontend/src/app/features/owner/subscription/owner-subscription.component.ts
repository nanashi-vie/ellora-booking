import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Clipboard } from '@angular/cdk/clipboard';
import { afterNextRender, Component, ElementRef, inject, Injector, OnDestroy, OnInit, PLATFORM_ID, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { OwnerSubscription, SalonPlanTier, SubscriptionApiService, SubscriptionPlan, SubscriptionRequest } from '../../../services/subscription-api.service';
import { SalonSubscriptionBadgeComponent } from '../../../shared/components/salon-subscription-badge.component';

@Component({
  standalone: true, imports: [CommonModule, SalonSubscriptionBadgeComponent, ReactiveFormsModule], templateUrl: './owner-subscription.component.html',
  styleUrls: ['../owner-data.scss', './owner-subscription.component.scss']
})
export class OwnerSubscriptionComponent implements OnInit, OnDestroy {
  private readonly api = inject(SubscriptionApiService);
  private readonly injector = inject(Injector);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly quoteHeading = viewChild<ElementRef<HTMLElement>>('quoteHeading');
  private readonly paymentHeading = viewChild<ElementRef<HTMLElement>>('paymentHeading');
  private readonly clipboard = inject(Clipboard);
  readonly plans = signal<SubscriptionPlan[]>([]);
  readonly current = signal<OwnerSubscription | null>(null);
  readonly history = signal<SubscriptionRequest[]>([]);
  readonly loading = signal(false); readonly historyLoading = signal(false); readonly requesting = signal(false);
  readonly catalogError = signal(''); readonly currentError = signal(''); readonly historyError = signal(''); readonly requestError = signal('');
  readonly message = signal(''); readonly quote = signal<SubscriptionPlan | null>(null);
  readonly paymentBusy = signal(false); readonly paymentError = signal(''); readonly copyMessage = signal(''); readonly copyFailed = signal(false);
  readonly failedQr = signal<string | null>(null);
  readonly reference = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(100)] });
  readonly page = signal(0); readonly total = signal(0); readonly last = signal(true);
  readonly tierLabels: Record<SalonPlanTier, string> = { STANDARD: 'Thường', VIP: 'VIP' };
  readonly statusLabels = { PENDING: 'Chờ admin duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối' };
  private version = 0; private historyVersion = 0; private destroyed = false; private paymentRequestId: number | null = null;

  ngOnInit(): void { void this.load(); }
  ngOnDestroy(): void { this.destroyed = true; this.version++; this.historyVersion++; }
  private failure(error: unknown): string {
    return error instanceof HttpErrorResponse && typeof error.error?.message === 'string'
      ? error.error.message : 'Chưa thực hiện được. Vui lòng thử lại.';
  }
  async load(): Promise<void> {
    if (this.destroyed || this.requesting() || this.paymentBusy()) return;
    const version = ++this.version; this.loading.set(true); this.quote.set(null);
    this.catalogError.set(''); this.currentError.set('');
    await Promise.all([
      this.api.plans().then(plans => { if (this.valid(version)) this.plans.set(plans); })
        .catch(error => { if (this.valid(version)) { this.plans.set([]); this.catalogError.set(this.failure(error)); } }),
      this.api.owner().then(current => { if (this.valid(version)) { this.setPaymentContext(current.pendingRequest?.id ?? null); this.current.set(current); } })
        .catch(error => { if (this.valid(version)) { this.current.set(null); this.currentError.set(this.failure(error)); } }),
      this.loadHistory()
    ]);
    if (this.valid(version)) this.loading.set(false);
  }
  private valid(version: number): boolean { return !this.destroyed && version === this.version; }
  async loadHistory(page = 0): Promise<void> {
    if (this.destroyed || this.requesting() || this.paymentBusy()) return;
    await this.fetchHistory(page);
  }
  private async fetchHistory(page: number): Promise<void> {
    const version = ++this.historyVersion; this.historyLoading.set(true); this.historyError.set('');
    try {
      const result = await this.api.ownerRequests(Math.max(0, page));
      if (this.destroyed || version !== this.historyVersion) return;
      this.history.set(result.content); this.page.set(result.pageNumber); this.last.set(result.last); this.total.set(result.totalElements);
    } catch (error) { if (!this.destroyed && version === this.historyVersion) this.historyError.set(this.failure(error)); }
    finally { if (!this.destroyed && version === this.historyVersion) this.historyLoading.set(false); }
  }
  blockedReason(plan: SubscriptionPlan): string {
    if (!this.current() || this.loading()) return 'Chờ tải trạng thái của tiệm';
    if (this.current()!.pendingRequest) return 'Tiệm đang có yêu cầu chờ duyệt';
    if (!plan.registrationAvailable || plan.monthlyPrice === null || plan.monthlyPrice <= 0) return 'Gói chưa sẵn sàng nhận đăng ký và chuyển khoản';
    const active = this.current()!.effectiveTier;
    return active && active !== plan.tier ? 'Chờ gói hiện tại hết hạn để đổi gói' : '';
  }
  choose(plan: SubscriptionPlan): void {
    if (this.destroyed || this.requesting() || this.paymentBusy() || this.blockedReason(plan)) return;
    this.quote.set({ ...plan }); this.requestError.set(''); this.message.set('');
    if (isPlatformBrowser(this.platformId)) afterNextRender(() => {
      const heading = this.quoteHeading()?.nativeElement;
      if (!this.destroyed && this.quote()?.tier === plan.tier && heading) {
        heading.focus({ preventScroll: true }); heading.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
    }, { injector: this.injector });
  }
  cancelQuote(): void { if (!this.requesting()) this.quote.set(null); }
  async confirm(): Promise<void> {
    const plan = this.quote();
    if (!plan || plan.monthlyPrice === null || this.requesting() || this.paymentBusy() || this.destroyed || this.blockedReason(plan)) return;
    const version = ++this.version; this.historyVersion++;
    this.historyLoading.set(false);
    this.requesting.set(true); this.requestError.set(''); this.message.set('');
    try {
      const request = await this.api.request(plan.tier, plan.monthlyPrice);
      if (!this.valid(version)) return;
      this.setPaymentContext(request.id);
      this.current.update(current => current ? { ...current, pendingRequest: request } : current);
      this.quote.set(null); this.message.set('Đã tạo hướng dẫn chuyển khoản. Hãy chuyển đúng số tiền, nội dung và báo đã chuyển; gói chỉ kích hoạt sau khi admin xác nhận đã nhận đủ tiền.');
      this.focusPayment(request.id);
      await this.fetchHistory(0);
    } catch (error) { if (this.valid(version)) this.requestError.set(this.failure(error)); }
    finally { if (this.valid(version)) this.requesting.set(false); }
  }
  statusLabel(item: SubscriptionRequest): string {
    return item.status === 'PENDING' ? item.paymentReportedAt ? 'Chờ đối soát' : 'Chờ chuyển khoản' : this.statusLabels[item.status];
  }
  private setPaymentContext(id: number | null): void {
    if (id === this.paymentRequestId) return;
    this.paymentRequestId = id; this.paymentError.set(''); this.copyMessage.set(''); this.copyFailed.set(false); this.failedQr.set(null); this.reference.reset('');
  }
  private focusPayment(id: number): void {
    if (isPlatformBrowser(this.platformId)) afterNextRender(() => {
      const heading = this.paymentHeading()?.nativeElement;
      if (!this.destroyed && this.current()?.pendingRequest?.id === id && heading) {
        heading.focus({ preventScroll: true }); heading.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
    }, { injector: this.injector });
  }
  async preparePayment(): Promise<void> { await this.paymentAction(false); }
  async reportPayment(): Promise<void> { await this.paymentAction(true); }
  private async paymentAction(report: boolean): Promise<void> {
    const item = this.current()?.pendingRequest;
    if (!item || item.status !== 'PENDING' || item.quotedPrice <= 0 || this.destroyed || this.paymentBusy() || this.requesting() || this.loading()) return;
    if (report && (!item.paymentQrUrl?.trim() || item.paymentReportedAt)) return;
    this.reference.markAsTouched(); this.paymentError.set(''); this.message.set('');
    if (report && this.reference.invalid) { this.paymentError.set('Mã giao dịch hoặc ghi chú tối đa 100 ký tự.'); return; }
    const version = ++this.version; this.historyVersion++; this.historyLoading.set(false); this.paymentBusy.set(true);
    try {
      const reference = this.reference.value.trim();
      const saved = report ? await this.api.reportPayment(item.id, reference ? { reference } : {}) : await this.api.preparePayment(item.id);
      if (!this.valid(version)) return;
      this.current.update(current => current ? { ...current, pendingRequest: saved } : current);
      this.history.update(rows => rows.map(row => row.id === saved.id ? saved : row));
      this.message.set(report ? 'Đã báo chuyển khoản. Đây là thông báo của tiệm; gói vẫn chờ admin kiểm tra và xác nhận tiền thực nhận.' : 'Đã tải hướng dẫn chuyển khoản theo yêu cầu của tiệm.');
      if (report) this.reference.reset('');
      this.focusPayment(saved.id);
      await this.fetchHistory(this.page());
    } catch (error) { if (this.valid(version)) this.paymentError.set(this.failure(error)); }
    finally { if (this.valid(version)) this.paymentBusy.set(false); }
  }
  copyTransfer(value: string, amount = false): void {
    let copied = false;
    try { copied = isPlatformBrowser(this.platformId) && this.clipboard.copy(value); } catch { /* Keep the instructions selectable if clipboard is unavailable. */ }
    this.copyFailed.set(!copied); this.copyMessage.set(copied ? amount ? 'Đã sao chép số tiền.' : 'Đã sao chép nội dung chuyển khoản.' : 'Chưa sao chép được. Hãy chọn và sao chép thông tin bên trên.');
  }
  formatTime(value: string | null): string {
    if (!value) return 'Chưa có';
    const offset = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value), date = new Date(offset ? value : value + 'Z');
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('vi-VN', { timeZone: offset ? 'Asia/Ho_Chi_Minh' : 'UTC', dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' }).format(date);
  }
}
