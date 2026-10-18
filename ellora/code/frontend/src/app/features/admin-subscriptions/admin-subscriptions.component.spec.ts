import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionApiService, SubscriptionPlan, SubscriptionRequest } from '../../services/subscription-api.service';
import { BillingApiService } from '../../services/billing-api.service';
import { AdminSubscriptionsComponent } from './admin-subscriptions.component';

describe('Admin subscription configuration and decisions', () => {
  const previousScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  let fixture: ComponentFixture<AdminSubscriptionsComponent>;
  const api = { adminPlans: vi.fn(), savePlan: vi.fn(), adminRequests: vi.fn(), decide: vi.fn() };
  const billing = { config: vi.fn() };
  const plans: SubscriptionPlan[] = [
    { tier: 'STANDARD', displayName: 'Thường', badgeLabel: 'Shop yêu thích', monthlyPrice: null, enabled: false, currency: 'VND', termMonths: 1, registrationAvailable: false },
    { tier: 'VIP', displayName: 'VIP', badgeLabel: 'Shop đối tác', monthlyPrice: 200000, enabled: true, currency: 'VND', termMonths: 1, registrationAvailable: true }
  ];
  const row = (id = 12): SubscriptionRequest => ({ id, salonId: 7, salonName: 'Tiệm mẫu', tier: 'VIP', quotedPrice: 150000, status: 'PENDING', createdAt: '2026-10-18T09:00:00', reviewedAt: null, reviewNote: null, startsAt: null, expiresAt: null, paymentQrUrl: 'https://example.test/request-qr.png', transferContent: 'ELLORA GOI' + id, paymentReportedAt: '2026-10-18T09:30:00', paymentReference: 'GD123', paymentConfirmedAt: null, receivedAmount: null });
  const page = (content = [row()], pageNumber = 0, totalElements = content.length) => ({ content, pageNumber, totalElements, last: totalElements <= (pageNumber + 1) * 20 });
  const settled = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); fixture.detectChanges(); };
  const render = async () => { fixture = TestBed.createComponent(AdminSubscriptionsComponent); fixture.detectChanges(); await settled(); return fixture.componentInstance; };
  const open = async () => { (fixture.nativeElement.querySelector('[aria-label="Xem yêu cầu #12"]') as HTMLButtonElement).click(); fixture.detectChanges(); };
  const submitDecision = () => fixture.nativeElement.querySelector('form[aria-label="Xét duyệt yêu cầu gói"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const receipt = (amount = 150000) => { const checkbox = fixture.nativeElement.querySelector('form[aria-label="Xét duyệt yêu cầu gói"] input[type=checkbox]') as HTMLInputElement; checkbox.checked = true; checkbox.dispatchEvent(new Event('change')); const input = fixture.nativeElement.querySelector('#subscription-received-amount') as HTMLInputElement; input.value = amount.toString(); input.dispatchEvent(new Event('input')); fixture.detectChanges(); };
  beforeEach(() => { vi.resetAllMocks(); Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() }); api.adminPlans.mockResolvedValue(plans); api.adminRequests.mockResolvedValue(page()); billing.config.mockResolvedValue({ qrUrl: 'https://example.test/latest-qr.png' }); api.savePlan.mockImplementation(async (tier: string, value: any) => ({ ...plans.find(plan => plan.tier === tier), ...value, registrationAvailable: value.enabled && value.monthlyPrice > 0 })); api.decide.mockImplementation(async (_id: number, value: any) => ({ ...row(), status: value.status, reviewNote: value.note ?? null, reviewedAt: '2026-10-18T10:00:00', startsAt: value.status === 'APPROVED' ? '2026-10-18T10:00:00' : null, expiresAt: value.status === 'APPROVED' ? '2026-11-18T10:00:00' : null, paymentConfirmedAt: value.status === 'APPROVED' ? '2026-10-18T10:00:00' : null, receivedAmount: value.status === 'APPROVED' ? value.expectedAmount : null })); TestBed.configureTestingModule({ imports: [AdminSubscriptionsComponent], providers: [provideRouter([]), { provide: SubscriptionApiService, useValue: api }, { provide: BillingApiService, useValue: billing }] }); });
  afterEach(() => { fixture?.destroy(); TestBed.resetTestingModule(); if (previousScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', previousScroll); else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView'); });

  it('requires positive enabled prices while allowing zero or null only for a disabled plan', async () => {
    const component = await render(), form = component.planForms.STANDARD;
    form.setValue({ monthlyPrice: null, enabled: true }); await component.savePlan('STANDARD'); expect(api.savePlan).not.toHaveBeenCalled();
    form.setValue({ monthlyPrice: 0, enabled: true }); await component.savePlan('STANDARD'); expect(api.savePlan).not.toHaveBeenCalled();
    form.setValue({ monthlyPrice: .5, enabled: false }); await component.savePlan('STANDARD'); expect(api.savePlan).not.toHaveBeenCalled();
    form.setValue({ monthlyPrice: 1000000000000000, enabled: false }); await component.savePlan('STANDARD'); expect(api.savePlan).not.toHaveBeenCalled();
    const price = fixture.nativeElement.querySelector('#plan-price-STANDARD') as HTMLInputElement;
    price.value = '120000'; price.dispatchEvent(new Event('input')); const enabled = fixture.nativeElement.querySelector('form input[type=checkbox]') as HTMLInputElement; enabled.checked = true; enabled.dispatchEvent(new Event('change'));
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settled();
    expect(api.savePlan).toHaveBeenCalledExactlyOnceWith('STANDARD', { monthlyPrice: 120000, enabled: true }); expect(component.plans()[0].monthlyPrice).toBe(120000);
    form.setValue({ monthlyPrice: 0, enabled: false }); await component.savePlan('STANDARD'); expect(api.savePlan).toHaveBeenLastCalledWith('STANDARD', { monthlyPrice: 0, enabled: false });
    form.setValue({ monthlyPrice: null, enabled: false }); await component.savePlan('STANDARD'); expect(api.savePlan).toHaveBeenLastCalledWith('STANDARD', { monthlyPrice: null, enabled: false });
  });

  it('preserves a changed price draft when saving fails and does not touch accepted request prices', async () => {
    const component = await render(); component.planForms.VIP.setValue({ monthlyPrice: 220000, enabled: false }); api.savePlan.mockRejectedValue(new Error('offline'));
    await component.savePlan('VIP'); expect(component.planForms.VIP.getRawValue()).toEqual({ monthlyPrice: 220000, enabled: false }); expect(component.planError()).not.toBe('');
    expect(component.requests()[0].quotedPrice).toBe(150000); expect(component.savingTier()).toBeNull();
  });

  it('requires a nonblank rejection reason and preserves it on failure, using the actual decision form', async () => {
    const component = await render(); await open();
    await fixture.whenStable();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#subscription-request-detail-title'));
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'center' });
    const select = fixture.nativeElement.querySelector('#subscription-decision') as HTMLSelectElement; select.value = 'REJECTED'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    const note = fixture.nativeElement.querySelector('#subscription-decision-note') as HTMLTextAreaElement; expect(note.required).toBe(true);
    note.value = '   '; note.dispatchEvent(new Event('input')); submitDecision(); await settled(); expect(api.decide).not.toHaveBeenCalled();
    note.value = '  Cần xác minh thông tin  '; note.dispatchEvent(new Event('input')); api.decide.mockRejectedValue(new HttpErrorResponse({ status: 400, error: { message: 'Yêu cầu đã được xử lý.' } })); submitDecision(); await settled();
    expect(api.decide).toHaveBeenCalledExactlyOnceWith(12, { status: 'REJECTED', note: 'Cần xác minh thông tin' });
    expect(component.decision.controls.note.value).toBe('  Cần xác minh thông tin  '); expect(component.decisionError()).toContain('đã được xử lý');
  });

  it('refills a full pending page after approval so the next page does not skip a request', async () => {
    const initial = Array.from({ length: 20 }, (_, index) => row(12 + index)); api.adminRequests.mockResolvedValueOnce(page(initial, 0, 41));
    const component = await render(); await open();
    api.adminRequests.mockResolvedValueOnce(page(Array.from({ length: 20 }, (_, index) => row(13 + index)), 0, 40));
    receipt(); submitDecision(); await settled();
    expect(api.decide).toHaveBeenCalledExactlyOnceWith(12, { status: 'APPROVED', paymentReceived: true, expectedAmount: 150000 }); expect(component.selected()?.status).toBe('APPROVED');
    expect(component.requests()).toHaveLength(20); expect(component.requests()[19].id).toBe(32);
    api.adminRequests.mockResolvedValueOnce(page([row(33)], 1, 40));
    const next = [...fixture.nativeElement.querySelectorAll('button')].find((element: any) => element.textContent.includes('Trang sau')) as HTMLButtonElement; next.click(); await settled();
    expect(api.adminRequests).toHaveBeenLastCalledWith('PENDING', 1); expect(component.requests()[0].id).toBe(33);
  });

  it('keeps a successful decision visible when list refresh fails and ignores an older filtered response', async () => {
    let old!: (value: ReturnType<typeof page>) => void; api.adminRequests.mockReturnValueOnce(new Promise(resolve => old = resolve));
    fixture = TestBed.createComponent(AdminSubscriptionsComponent); fixture.detectChanges(); const component = fixture.componentInstance;
    api.adminRequests.mockResolvedValueOnce(page()); component.setFilter(''); await settled(); old(page([row(99)])); await settled(); expect(component.requests()[0].id).toBe(12);
    await open(); api.adminRequests.mockRejectedValueOnce(new Error('offline')); receipt(); submitDecision(); await settled();
    expect(component.selected()?.status).toBe('APPROVED'); expect(component.message()).toContain('Đã xác nhận nhận đủ tiền'); expect(component.decisionError()).toBe(''); expect(component.error()).toContain('Đã lưu quyết định');
    expect(component.requests()[0].status).toBe('APPROVED'); expect(component.deciding()).toBe(false);
  });
  it('requires an unchecked receipt acknowledgment and exact snapshot amount, resetting both for another request', async () => {
    const component = await render(); await open();
    expect(component.decision.controls.paymentReceived.value).toBe(false); expect(component.decision.controls.expectedAmount.value).toBeNull(); await component.decide(); expect(api.decide).not.toHaveBeenCalled();
    receipt(200000); await component.decide(); expect(api.decide).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.payment-snapshot img').getAttribute('src')).toBe(row().paymentQrUrl);
    receipt(); component.select(row(13)); fixture.detectChanges(); expect(component.decision.controls.paymentReceived.value).toBe(false); expect(component.decision.controls.expectedAmount.value).toBeNull();
    component.select(row()); fixture.detectChanges(); receipt(); api.adminRequests.mockResolvedValue(page([])); submitDecision(); await settled();
    expect(api.decide).toHaveBeenCalledExactlyOnceWith(12, { status: 'APPROVED', paymentReceived: true, expectedAmount: 150000 });
  });
  it('cannot approve before the owner report, but allows a reasoned rejection and links to shared QR setup', async () => {
    api.adminRequests.mockResolvedValue(page([{ ...row(), paymentReportedAt: null, paymentReference: null }])); billing.config.mockResolvedValue({ qrUrl: null }); const component = await render(); await open();
    expect(fixture.nativeElement.textContent).toContain('Chờ chuyển khoản'); expect(fixture.nativeElement.querySelector('a[href="/admin/billing"]')).not.toBeNull();
    receipt(); await component.decide(); expect(api.decide).not.toHaveBeenCalled();
    component.decision.controls.status.setValue('REJECTED'); component.decision.controls.note.setValue('Không thể đối soát'); fixture.detectChanges(); submitDecision(); await settled();
    expect(api.decide).toHaveBeenCalledExactlyOnceWith(12, { status: 'REJECTED', note: 'Không thể đối soát' });
  });
});
