import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MyBookings } from './my-bookings.component';
import { BookingApiService, BookingItem } from '../../../services/booking-api.service';

describe('Customer service confirmation and admin reports', () => {
  let fixture: ComponentFixture<MyBookings>;
  let component: MyBookings;
  const api = { getMyBookings: vi.fn(), respondToCompletion: vi.fn(), reviewBooking: vi.fn(), cancelBooking: vi.fn() };
  const booking = {
    id: 12, salonName: 'Ellora Nail', serviceName: 'Sơn gel', scheduledAt: '2026-10-17T10:00:00',
    status: 'COMPLETED', reviewed: false, completionConfirmation: 'PENDING', completionVersion: 1
  } as BookingItem;
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); fixture.detectChanges(); };
  const button = (text: string): HTMLButtonElement | undefined => Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
    .find(element => element.textContent!.trim() === text);
  const page = (item: BookingItem) => ({ content: [item], last: true });

  beforeEach(async () => {
    vi.useFakeTimers(); vi.resetAllMocks();
    api.getMyBookings.mockResolvedValue(page(booking));
    await TestBed.configureTestingModule({ imports: [MyBookings], providers: [{ provide: BookingApiService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(MyBookings); component = fixture.componentInstance;
    fixture.detectChanges(); await flush();
  });
  afterEach(() => { fixture.destroy(); TestBed.resetTestingModule(); vi.clearAllTimers(); vi.useRealTimers(); });

  it('asks for confirmation after the salon completes and gates a new review', () => {
    expect(button('Đã sử dụng dịch vụ')).toBeDefined(); expect(button('Chưa hoàn thành')).toBeDefined();
    expect(button('Đánh giá')).toBeUndefined();
    component.openReview(booking); expect(component.reviewId()).toBeNull();
  });

  it('confirms the exact completion version and then enables the review action', async () => {
    api.respondToCompletion.mockResolvedValue({ ...booking, completionConfirmation: 'CONFIRMED' });
    button('Đã sử dụng dịch vụ')!.click(); await flush();
    expect(api.respondToCompletion).toHaveBeenCalledWith(12, { completed: true, completionVersion: 1 });
    expect(button('Chưa hoàn thành')).toBeUndefined(); expect(button('Đánh giá')).toBeDefined();
    button('Đánh giá')!.click(); fixture.detectChanges(); expect(component.reviewId()).toBe(12);
  });

  it('requires a reason before sending a not-complete report', async () => {
    button('Chưa hoàn thành')!.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('textarea[name=completionReason]')).not.toBeNull();
    component.disputeReason = '   '; await component.submitDispute();
    expect(api.respondToCompletion).not.toHaveBeenCalled(); expect(component.completionError()).toContain('lý do');
    component.disputeReason = 'x'.repeat(1001); await component.submitDispute();
    expect(api.respondToCompletion).not.toHaveBeenCalled();
  });

  it('retains the reason on failure and shows the submitted admin case after retry', async () => {
    button('Chưa hoàn thành')!.click(); fixture.detectChanges();
    component.disputeReason = '  Chưa làm xong móng  ';
    api.respondToCompletion.mockRejectedValueOnce({ error: { message: 'Tạm thời chưa lưu được.' } });
    await component.submitDispute(); fixture.detectChanges();
    expect(component.disputeReason).toBe('  Chưa làm xong móng  '); expect(component.disputeId()).toBe(12);
    expect(component.completionError()).toBe('Tạm thời chưa lưu được.');
    api.respondToCompletion.mockResolvedValue({ ...booking, completionConfirmation: 'DISPUTED', completionCustomerNote: 'Chưa làm xong móng' });
    const form = fixture.nativeElement.querySelector('form[aria-label="Phản ánh dịch vụ chưa hoàn thành"]');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush();
    expect(api.respondToCompletion).toHaveBeenLastCalledWith(12, { completed: false, completionVersion: 1, reason: 'Chưa làm xong móng' });
    expect(component.disputeId()).toBeNull(); expect(button('Chưa hoàn thành')).toBeUndefined();
    expect(fixture.nativeElement.textContent).toContain('Phản ánh đang chờ admin xử lý');
    expect(fixture.nativeElement.textContent).toContain('Chưa làm xong móng');
  });

  it('ignores an older polling result that arrives after a confirmation succeeds', async () => {
    let resolveOld!: (value: unknown) => void;
    api.getMyBookings.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    const loading = component.load(true, true);
    api.respondToCompletion.mockResolvedValue({ ...booking, completionConfirmation: 'CONFIRMED' });
    await component.confirmService(booking);
    resolveOld(page(booking)); await loading;
    expect(component.bookings()[0].completionConfirmation).toBe('CONFIRMED');
  });

  it('prevents duplicate submissions and pauses polling while a response is saving', async () => {
    let resolveResponse!: (value: BookingItem) => void;
    api.respondToCompletion.mockReturnValue(new Promise(resolve => { resolveResponse = resolve; }));
    const first = component.confirmService(booking);
    await component.confirmService(booking); await component.load(true, true);
    expect(api.respondToCompletion).toHaveBeenCalledTimes(1); expect(api.getMyBookings).toHaveBeenCalledTimes(1);
    resolveResponse({ ...booking, completionConfirmation: 'CONFIRMED' }); await first;
    expect(component.completionSaving()).toBeNull();
  });

  it('keeps a paginated appointment and its draft visible while a report editor is open', async () => {
    const laterBooking = { ...booking, id: 99 };
    api.getMyBookings.mockResolvedValueOnce({ content: [laterBooking], last: true });
    await component.load(); component.openDispute(laterBooking); component.disputeReason = 'Phần móng còn thiếu.';
    const calls = api.getMyBookings.mock.calls.length;
    await component.load(true, true); await vi.advanceTimersByTimeAsync(30000); fixture.detectChanges();
    expect(api.getMyBookings).toHaveBeenCalledTimes(calls);
    expect(component.bookings().some(row => row.id === 99)).toBe(true);
    expect(component.disputeId()).toBe(99); expect(component.disputeReason).toBe('Phần móng còn thiếu.');
    expect(fixture.nativeElement.querySelector('#completion-reason-99')).not.toBeNull();
  });

  it('does not attach a draft from an earlier completion cycle to a newly completed booking', async () => {
    component.openDispute(booking); component.disputeReason = 'Lý do của lần trước';
    component.bookings.set([{ ...booking, completionVersion: 2 }]);
    await component.submitDispute();
    expect(api.respondToCompletion).not.toHaveBeenCalled(); expect(component.completionError()).toContain('đã thay đổi');
    component.openDispute(component.bookings()[0]); expect(component.disputeReason).toBe('');
  });

  it('ignores a silent refresh already in flight when the customer opens a later-page editor', async () => {
    const laterBooking = { ...booking, id: 99 }; component.bookings.set([booking, laterBooking]);
    let resolveRefresh!: (value: unknown) => void;
    api.getMyBookings.mockReturnValueOnce(new Promise(resolve => { resolveRefresh = resolve; }));
    const refresh = component.load(true, true);
    component.openDispute(laterBooking); component.disputeReason = 'Đang nhập lý do';
    resolveRefresh(page(booking)); await refresh;
    expect(component.bookings().some(row => row.id === 99)).toBe(true);
    expect(component.disputeReason).toBe('Đang nhập lý do');
  });

  it('shows the admin conclusion and allows confirmation again only after another salon completion', async () => {
    const reopened = { ...booking, status: 'IN_PROGRESS', completionConfirmation: 'REOPENED', completionAdminNote: 'Tiệm cần làm lại phần còn thiếu.' } as BookingItem;
    api.getMyBookings.mockResolvedValueOnce(page(reopened)); await component.load(true, true); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Tiệm cần làm lại phần còn thiếu.');
    expect(button('Chưa hoàn thành')).toBeUndefined(); expect(button('Đánh giá')).toBeUndefined();
    api.getMyBookings.mockResolvedValueOnce(page({ ...booking, completionVersion: 2 }));
    await component.load(true, true); fixture.detectChanges();
    expect(button('Đã sử dụng dịch vụ')).toBeDefined(); expect(component.bookings()[0].completionVersion).toBe(2);
  });

  it.each(['CONFIRMED', 'ADMIN_CONFIRMED'] as const)('allows reviews for %s and preserves historical reviewed bookings', state => {
    component.bookings.set([{ ...booking, completionConfirmation: state }]); fixture.detectChanges();
    expect(button('Đánh giá')).toBeDefined(); expect(button('Đã sử dụng dịch vụ')).toBeUndefined();
    component.bookings.set([{ ...booking, reviewed: true, completionConfirmation: null }]); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Đã đánh giá'); expect(button('Chưa hoàn thành')).toBeUndefined();
  });

  it('does not update the destroyed page when a completion response arrives late', async () => {
    let resolveResponse!: (value: BookingItem) => void;
    api.respondToCompletion.mockReturnValue(new Promise(resolve => { resolveResponse = resolve; }));
    const response = component.confirmService(booking); fixture.destroy();
    resolveResponse({ ...booking, completionConfirmation: 'CONFIRMED' }); await response;
    expect(component.bookings()[0].completionConfirmation).toBe('PENDING');
  });
});
