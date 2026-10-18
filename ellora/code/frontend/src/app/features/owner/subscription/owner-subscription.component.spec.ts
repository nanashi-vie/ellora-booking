import { HttpErrorResponse } from '@angular/common/http';
import { Clipboard } from '@angular/cdk/clipboard';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OwnerSubscription, SubscriptionApiService, SubscriptionPlan, SubscriptionRequest } from '../../../services/subscription-api.service';
import { OwnerSubscriptionComponent } from './owner-subscription.component';

describe('Owner subscription requests', () => {
  const previousScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  let fixture: ComponentFixture<OwnerSubscriptionComponent>;
  const api = { plans: vi.fn(), owner: vi.fn(), ownerRequests: vi.fn(), request: vi.fn(), preparePayment: vi.fn(), reportPayment: vi.fn() };
  const clipboard = { copy: vi.fn() };
  const plans: SubscriptionPlan[] = [
    { tier: 'STANDARD', displayName: 'Thường', badgeLabel: 'Shop yêu thích', monthlyPrice: 120000, enabled: true, currency: 'VND', termMonths: 1, registrationAvailable: true },
    { tier: 'VIP', displayName: 'VIP', badgeLabel: 'Shop đối tác', monthlyPrice: null, enabled: false, currency: 'VND', termMonths: 1, registrationAvailable: false }
  ];
  const owner: OwnerSubscription = { salonId: 7, effectiveTier: null, badgeLabel: null, startsAt: null, expiresAt: null, pendingRequest: null };
  const request: SubscriptionRequest = { id: 12, salonId: 7, salonName: 'Tiệm mẫu', tier: 'STANDARD', quotedPrice: 120000, status: 'PENDING', createdAt: '2026-10-18T09:00:00', reviewedAt: null, reviewNote: null, startsAt: null, expiresAt: null, paymentQrUrl: 'https://example.test/saved-qr.png', transferContent: 'ELLORA GOI12', paymentReportedAt: null, paymentReference: null, paymentConfirmedAt: null, receivedAmount: null };
  const page = (content: SubscriptionRequest[] = []) => ({ content, pageNumber: 0, totalElements: content.length, last: true });
  const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); fixture.detectChanges(); };
  const render = async () => { fixture = TestBed.createComponent(OwnerSubscriptionComponent); fixture.detectChanges(); await settle(); return fixture.componentInstance; };
  const button = (text: string) => [...fixture.nativeElement.querySelectorAll('button')].find((item: any) => item.textContent.includes(text)) as HTMLButtonElement;
  beforeEach(() => { vi.resetAllMocks(); Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() }); api.plans.mockResolvedValue(plans); api.owner.mockResolvedValue(owner); api.ownerRequests.mockResolvedValue(page()); api.request.mockResolvedValue(request); clipboard.copy.mockReturnValue(true); api.preparePayment.mockResolvedValue(request); api.reportPayment.mockResolvedValue({ ...request, paymentReportedAt: '2026-10-18T10:00:00', paymentReference: 'GD123' }); TestBed.configureTestingModule({ imports: [OwnerSubscriptionComponent], providers: [{ provide: SubscriptionApiService, useValue: api }, { provide: Clipboard, useValue: clipboard }] }); });
  afterEach(() => { fixture?.destroy(); TestBed.resetTestingModule(); if (previousScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', previousScroll); else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView'); });
  it('shows unavailable prices honestly and focuses confirmation before creating positive-price transfer instructions', async () => {
    const component = await render(); expect(fixture.nativeElement.textContent).toContain('Chưa công bố giá');
    expect(button('Chọn gói VIP').disabled).toBe(true); button('Chọn gói Thường').click(); fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#subscription-confirm-title'));
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'center' });
    expect(api.request).not.toHaveBeenCalled(); expect(fixture.nativeElement.querySelector('.confirmation').textContent).toContain('120,000 ₫');
    component.paymentError.set('Lỗi của yêu cầu cũ'); component.reference.setValue('old-reference');
    button('Đồng ý giá').click(); await settle();
    expect(api.request).toHaveBeenCalledExactlyOnceWith('STANDARD', 120000); expect(component.current()?.pendingRequest?.id).toBe(12);
    expect(component.quote()).toBeNull(); expect(button('Chọn gói Thường').disabled).toBe(true); expect(fixture.nativeElement.textContent).toContain('Chờ chuyển khoản');
    expect(fixture.nativeElement.querySelector('.payment-instructions img').getAttribute('src')).toBe(request.paymentQrUrl);
    expect(component.paymentError()).toBe(''); expect(component.reference.value).toBe('');
  });
  it('blocks another active tier but offers same-tier renewal using server effective status', async () => {
    api.owner.mockResolvedValue({ ...owner, effectiveTier: 'VIP', badgeLabel: 'Shop đối tác', startsAt: '2026-10-01T09:00:00', expiresAt: '2026-11-01T09:00:00' });
    api.plans.mockResolvedValue([plans[0], { ...plans[1], monthlyPrice: 250000, enabled: true, registrationAvailable: true }]);
    const component = await render(); expect(button('Chọn gói Thường').disabled).toBe(true); expect(button('Yêu cầu gia hạn').disabled).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Chờ gói hiện tại hết hạn'); component.choose(plans[0]); expect(component.quote()).toBeNull();
    button('Yêu cầu gia hạn').click(); fixture.detectChanges(); button('Đồng ý giá').click(); await settle(); expect(api.request).toHaveBeenCalledWith('VIP', 250000);
  });
  it('keeps the accepted quote on stale-price failure and requires a new choice after catalog reload', async () => {
    const component = await render(); component.choose(plans[0]); api.request.mockRejectedValue(new HttpErrorResponse({ status: 400, error: { message: 'Giá đã thay đổi, tải lại gói.' } }));
    await component.confirm(); fixture.detectChanges(); expect(component.quote()?.monthlyPrice).toBe(120000); expect(component.requestError()).toContain('Giá đã thay đổi');
    api.plans.mockResolvedValue([{ ...plans[0], monthlyPrice: 130000 }, plans[1]]); await component.load(); fixture.detectChanges();
    expect(component.quote()).toBeNull(); expect(component.plans()[0].monthlyPrice).toBe(130000); expect(api.request).toHaveBeenCalledOnce();
  });
  it('does not overwrite fresh owner state with an older load and retains successful request state on history-refresh failure', async () => {
    let complete!: (value: OwnerSubscription) => void; api.owner.mockReturnValueOnce(new Promise<OwnerSubscription>(resolve => complete = resolve));
    fixture = TestBed.createComponent(OwnerSubscriptionComponent); fixture.detectChanges(); const component = fixture.componentInstance;
    api.owner.mockResolvedValue({ ...owner, pendingRequest: request }); await component.load(); complete(owner); await settle();
    expect(component.current()?.pendingRequest?.id).toBe(12);
    api.owner.mockResolvedValue(owner); await component.load(); component.choose(plans[0]); api.ownerRequests.mockRejectedValue(new Error('offline')); await component.confirm(); fixture.detectChanges();
    expect(component.current()?.pendingRequest?.id).toBe(12); expect(component.message()).toContain('Đã tạo hướng dẫn'); expect(component.requestError()).toBe(''); expect(component.historyError()).not.toBe('');
  });
  it('uses the immutable QR and amount, copies instructions, reports once and never activates from an owner report', async () => {
    api.owner.mockResolvedValue({ ...owner, pendingRequest: request }); const component = await render();
    button('Sao chép nội dung').click(); expect(clipboard.copy).toHaveBeenCalledWith('ELLORA GOI12'); button('Sao chép số tiền').click(); expect(clipboard.copy).toHaveBeenLastCalledWith('120000');
    const reference = fixture.nativeElement.querySelector('#subscription-payment-reference') as HTMLInputElement; reference.value = '  GD123  '; reference.dispatchEvent(new Event('input'));
    fixture.nativeElement.querySelector('form[aria-label="Báo đã chuyển khoản"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settle();
    expect(api.reportPayment).toHaveBeenCalledExactlyOnceWith(12, { reference: 'GD123' }); expect(component.current()?.effectiveTier).toBeNull(); expect(fixture.nativeElement.textContent).toContain('Chờ đối soát');
    expect(fixture.nativeElement.querySelector('form[aria-label="Báo đã chuyển khoản"]')).toBeNull(); await component.reportPayment(); expect(api.reportPayment).toHaveBeenCalledOnce();
    clipboard.copy.mockReturnValue(false); component.copyTransfer('ELLORA GOI12'); fixture.detectChanges(); expect(component.copyFailed()).toBe(true);
  });
  it('prepares a legacy quote even when catalog is disabled, preserves reference on failure, and blocks zero or unavailable new plans', async () => {
    api.owner.mockResolvedValue({ ...owner, pendingRequest: { ...request, paymentQrUrl: null } }); api.plans.mockResolvedValue(plans.map(plan => ({ ...plan, registrationAvailable: false })));
    const component = await render(); expect(fixture.nativeElement.querySelector('form[aria-label="Báo đã chuyển khoản"]')).toBeNull();
    button('Hiện hướng dẫn').click(); await settle(); expect(api.preparePayment).toHaveBeenCalledExactlyOnceWith(12); expect(fixture.nativeElement.querySelector('.payment-instructions img').getAttribute('src')).toBe(request.paymentQrUrl);
    component.reference.setValue('bank-ref');
    let finishHistory!: (value: ReturnType<typeof page>) => void; api.ownerRequests.mockReturnValueOnce(new Promise(resolve => finishHistory = resolve)); const oldHistory = component.loadHistory(1); expect(component.historyLoading()).toBe(true);
    api.reportPayment.mockRejectedValue(new Error('offline')); await component.reportPayment(); expect(component.reference.value).toBe('bank-ref'); expect(component.paymentError()).not.toBe(''); expect(component.current()?.pendingRequest?.paymentReportedAt).toBeNull(); expect(component.historyLoading()).toBe(false);
    finishHistory(page()); await oldHistory;
    api.owner.mockResolvedValue({ ...owner, pendingRequest: request }); await component.load(); expect(component.reference.value).toBe('bank-ref');
    api.owner.mockResolvedValue({ ...owner, pendingRequest: { ...request, id: 13, transferContent: 'ELLORA GOI13' } }); await component.load(); expect(component.reference.value).toBe(''); expect(component.paymentError()).toBe('');
    api.owner.mockResolvedValue(owner); api.plans.mockResolvedValue([{ ...plans[0], monthlyPrice: 0, registrationAvailable: true }, { ...plans[1], monthlyPrice: 200000, enabled: true, registrationAvailable: false }]); await component.load(); fixture.detectChanges();
    expect(button('Chọn gói Thường').disabled).toBe(true); expect(button('Chọn gói VIP').disabled).toBe(true);
  });
});
