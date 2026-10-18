import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, ElementRef, inject, Injector, OnDestroy, OnInit, PLATFORM_ID, signal, viewChild } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { BillingApiService } from '../../services/billing-api.service';
import { SalonPlanTier, SubscriptionApiService, SubscriptionPlan, SubscriptionRequest, SubscriptionRequestStatus } from '../../services/subscription-api.service';

function priceForm() {
  return new FormGroup({ monthlyPrice: new FormControl<number | null>(null), enabled: new FormControl(false, { nonNullable: true }) }, {
    validators: (control: AbstractControl) => {
      const price = control.get('monthlyPrice')?.value, enabled = control.get('enabled')?.value;
      return price === null ? enabled ? { priceRequired: true } : null
        : Number.isSafeInteger(price) && price >= 0 && (!enabled || price > 0) && price <= 999999999999999 ? null : { priceInvalid: true };
    }
  });
}

@Component({
  standalone: true, imports: [CommonModule, ReactiveFormsModule, RouterLink], templateUrl: './admin-subscriptions.component.html',
  styleUrls: ['../admin-content/admin-page.scss', './admin-subscriptions.component.scss']
})
export class AdminSubscriptionsComponent implements OnInit, OnDestroy {
  private readonly api = inject(SubscriptionApiService);
  private readonly billing = inject(BillingApiService);
  private readonly injector = inject(Injector);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly requestHeading = viewChild<ElementRef<HTMLElement>>('requestHeading');
  readonly plans = signal<SubscriptionPlan[]>([]); readonly requests = signal<SubscriptionRequest[]>([]);
  readonly selected = signal<SubscriptionRequest | null>(null);
  readonly loadingPlans = signal(false); readonly loading = signal(false); readonly savingTier = signal<SalonPlanTier | null>(null); readonly deciding = signal(false);
  readonly planError = signal(''); readonly error = signal(''); readonly decisionError = signal(''); readonly message = signal(''); readonly planMessage = signal('');
  readonly page = signal(0); readonly total = signal(0); readonly last = signal(true);
  readonly qrUrl = signal<string | null>(null); readonly qrError = signal('');
  readonly planForms = { STANDARD: priceForm(), VIP: priceForm() };
  readonly decision = new FormGroup({ status: new FormControl<'APPROVED' | 'REJECTED'>('APPROVED', { nonNullable: true }), note: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }), paymentReceived: new FormControl(false, { nonNullable: true }), expectedAmount: new FormControl<number | null>(null) }, {
    validators: control => control.get('status')?.value === 'REJECTED' && !control.get('note')?.value.trim() ? { reasonRequired: true } : null
  });
  readonly tierLabels: Record<SalonPlanTier, string> = { STANDARD: 'Thường', VIP: 'VIP' };
  readonly statusLabels = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối' };
  filter: SubscriptionRequestStatus | '' = 'PENDING';
  private plansVersion = 0; private queueVersion = 0; private destroyed = false;

  constructor() {
    this.decision.controls.status.valueChanges.pipe(takeUntilDestroyed()).subscribe(status => {
      if (status === 'REJECTED') { this.decision.controls.paymentReceived.reset(false); this.decision.controls.expectedAmount.reset(null); }
    });
  }
  ngOnInit(): void { void this.loadPlans(); void this.loadRequests(); }
  ngOnDestroy(): void { this.destroyed = true; this.plansVersion++; this.queueVersion++; }
  private failure(error: unknown): string {
    return error instanceof HttpErrorResponse && typeof error.error?.message === 'string'
      ? error.error.message : 'Chưa thực hiện được. Vui lòng thử lại.';
  }
  async loadPlans(): Promise<void> {
    if (this.destroyed || this.savingTier() || this.deciding()) return;
    const version = ++this.plansVersion; this.loadingPlans.set(true); this.planError.set(''); this.qrError.set('');
    await Promise.all([
      this.api.adminPlans().then(plans => {
        if (this.destroyed || version !== this.plansVersion) return;
        this.plans.set(plans); plans.forEach(plan => this.planForms[plan.tier].reset({ monthlyPrice: plan.monthlyPrice, enabled: plan.enabled }));
      }).catch(error => { if (!this.destroyed && version === this.plansVersion) this.planError.set(this.failure(error)); }),
      this.billing.config().then(config => { if (!this.destroyed && version === this.plansVersion) this.qrUrl.set(config.qrUrl?.trim() || null); })
        .catch(error => { if (!this.destroyed && version === this.plansVersion) { this.qrUrl.set(null); this.qrError.set(this.failure(error)); } })
    ]);
    if (!this.destroyed && version === this.plansVersion) this.loadingPlans.set(false);
  }
  async savePlan(tier: SalonPlanTier): Promise<void> {
    if (this.destroyed || this.loadingPlans() || this.savingTier() || this.deciding()) return;
    const form = this.planForms[tier]; form.markAllAsTouched(); this.planError.set(''); this.planMessage.set('');
    if (form.invalid) { this.planError.set('Gói mở đăng ký cần giá nguyên lớn hơn 0 ₫, tối đa 999.999.999.999.999 ₫. Chỉ giữ giá 0 hoặc để trống khi tắt đăng ký.'); return; }
    const version = ++this.plansVersion; this.savingTier.set(tier);
    try {
      const saved = await this.api.savePlan(tier, form.getRawValue());
      if (this.destroyed || version !== this.plansVersion) return;
      this.plans.update(plans => plans.map(plan => plan.tier === tier ? saved : plan));
      form.reset({ monthlyPrice: saved.monthlyPrice, enabled: saved.enabled });
      this.planMessage.set('Đã lưu gói ' + this.tierLabels[tier] + '. Yêu cầu đã gửi và kỳ đang có hiệu lực giữ nguyên.');
    } catch (error) { if (!this.destroyed && version === this.plansVersion) this.planError.set(this.failure(error)); }
    finally { if (!this.destroyed && version === this.plansVersion) this.savingTier.set(null); }
  }
  async loadRequests(page = 0): Promise<void> {
    if (this.destroyed || this.deciding()) return;
    this.selected.set(null); this.resetDecision(); this.decisionError.set('');
    this.requests.set([]);
    await this.fetchRequests(page, false);
  }
  setFilter(value: string): void {
    if (this.deciding() || !['', 'PENDING', 'APPROVED', 'REJECTED'].includes(value)) return;
    this.filter = value as SubscriptionRequestStatus | ''; void this.loadRequests();
  }
  private async fetchRequests(page: number, afterDecision: boolean): Promise<void> {
    const version = ++this.queueVersion; this.loading.set(true); this.error.set('');
    const filter = this.filter;
    try {
      let result = await this.api.adminRequests(filter, Math.max(0, page));
      if (this.destroyed || version !== this.queueVersion) return;
      if (!result.content.length && page > 0) {
        result = await this.api.adminRequests(filter, page - 1);
        if (this.destroyed || version !== this.queueVersion) return;
      }
      this.requests.set(result.content); this.page.set(result.pageNumber); this.total.set(result.totalElements); this.last.set(result.last);
    } catch (error) {
      if (!this.destroyed && version === this.queueVersion) this.error.set((afterDecision ? 'Đã lưu quyết định, nhưng chưa tải lại được danh sách. ' : '') + this.failure(error));
    } finally { if (!this.destroyed && version === this.queueVersion) this.loading.set(false); }
  }
  select(item: SubscriptionRequest): void {
    if (this.destroyed || this.deciding() || this.loading()) return;
    this.selected.set(item); this.resetDecision(); this.decisionError.set(''); this.message.set('');
    if (isPlatformBrowser(this.platformId)) afterNextRender(() => {
      const heading = this.requestHeading()?.nativeElement;
      if (!this.destroyed && this.selected()?.id === item.id && heading) {
        heading.focus({ preventScroll: true }); heading.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
    }, { injector: this.injector });
  }
  async decide(): Promise<void> {
    const item = this.selected();
    if (!item || item.status !== 'PENDING' || this.destroyed || this.deciding() || this.savingTier() || this.loading()) return;
    this.decision.markAllAsTouched(); this.decisionError.set(''); this.message.set('');
    const value = this.decision.getRawValue(), note = value.note.trim();
    if (value.status === 'APPROVED' && (!this.canApprove(item) || !value.paymentReceived || !Number.isSafeInteger(value.expectedAmount) || value.expectedAmount !== item.quotedPrice)) {
      this.decisionError.set('Chỉ kích hoạt sau khi tiệm báo chuyển khoản. Kiểm tra tiền thực nhận, tích xác nhận và nhập đúng số tiền đã chốt.'); return;
    }
    if (this.decision.invalid || !['APPROVED', 'REJECTED'].includes(value.status) || note.length > 1000) {
      this.decisionError.set('Khi từ chối, nhập lý do; ghi chú tối đa 1000 ký tự.'); return;
    }
    this.queueVersion++; this.deciding.set(true);
    try {
      const saved = await this.api.decide(item.id, { status: value.status, ...(note ? { note } : {}), ...(value.status === 'APPROVED' ? { paymentReceived: true, expectedAmount: value.expectedAmount! } : {}) });
      if (this.destroyed) return;
      this.selected.set(saved); this.resetDecision();
      const removed = !!this.filter && saved.status !== this.filter && this.requests().some(row => row.id === saved.id);
      this.requests.update(rows => rows.flatMap(row => row.id !== saved.id ? [row] : this.filter && saved.status !== this.filter ? [] : [saved]));
      if (removed) this.total.update(total => Math.max(0, total - 1));
      this.message.set(saved.status === 'APPROVED' ? 'Đã xác nhận nhận đủ tiền và kích hoạt tháng đăng ký theo giá đã chốt.' : 'Đã từ chối yêu cầu; gói hiện tại của tiệm giữ nguyên.');
      await this.fetchRequests(this.page(), true);
    } catch (error) { if (!this.destroyed) this.decisionError.set(this.failure(error)); }
    finally { if (!this.destroyed) this.deciding.set(false); }
  }
  private resetDecision(): void { this.decision.reset({ status: 'APPROVED', note: '', paymentReceived: false, expectedAmount: null }); }
  canApprove(item: SubscriptionRequest): boolean {
    return item.status === 'PENDING' && item.quotedPrice > 0 && !!item.paymentQrUrl?.trim() && !!item.paymentReportedAt;
  }
  statusLabel(item: SubscriptionRequest): string {
    return item.status === 'PENDING' ? item.paymentReportedAt ? 'Chờ đối soát' : 'Chờ chuyển khoản' : this.statusLabels[item.status];
  }
  formatTime(value: string | null): string {
    if (!value) return 'Chưa có';
    const offset = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value), date = new Date(offset ? value : value + 'Z');
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('vi-VN', { timeZone: offset ? 'Asia/Ho_Chi_Minh' : 'UTC', dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' }).format(date);
  }
}
