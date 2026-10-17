import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Clipboard } from '@angular/cdk/clipboard';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminBookingDisputesComponent } from './admin-booking-disputes.component';
import { AdminBookingDispute, AdminBookingDisputePage, AdminBookingDisputesApiService } from '../../services/admin-booking-disputes-api.service';
import { apiConfig } from '../../config/api.config';

const sampleCase: AdminBookingDispute = {
  id: 7, bookingId: 19, completionVersion: 2, status: 'OPEN', reason: 'Tiệm chưa làm xong dịch vụ.',
  createdAt: '2026-10-18T14:30:00', resolvedAt: null, resolvedBy: null, adminNote: null,
  customerName: 'Mai', customerPhone: '0901234567', customerEmail: 'mai@example.test',
  salonId: 42, salonName: 'Ellora Nail', salonPhone: '02812345678', salonEmail: 'tiem@example.test', salonAddress: '12 Đường Hoa',
  ownerName: 'Linh', ownerPhone: '0912345678', ownerEmail: 'linh@example.test',
  serviceName: 'Sơn gel', servicePrice: 150000, scheduledAt: '2026-10-18T14:00:00', durationMinutes: 60,
  employeeName: 'Hà', bookingStatus: 'COMPLETED', completedAt: '2026-10-18T15:00:00'
};
const page = (items: AdminBookingDispute[] = [sampleCase], pageNumber = 0, last = true): AdminBookingDisputePage => ({ content: items, totalElements: items.length, pageNumber, last });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe('Admin booking dispute API contract', () => {
  let http: HttpTestingController;
  let api: AdminBookingDisputesApiService;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController); api = TestBed.inject(AdminBookingDisputesApiService);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('lists pending cases by default, omits the status for all cases and sends pagination', async () => {
    const pending = api.list();
    http.expectOne(request => request.url === apiConfig.baseUrl + '/admin/booking-disputes' && request.params.get('status') === 'OPEN'
      && request.params.get('page') === '0' && request.params.get('size') === '20').flush({ data: page() });
    expect((await pending).content[0].bookingId).toBe(19);
    const all = api.list('', 2);
    http.expectOne(request => request.url === apiConfig.baseUrl + '/admin/booking-disputes' && !request.params.has('status')
      && request.params.get('page') === '2').flush({ data: page([], 2) });
    expect((await all).pageNumber).toBe(2);
  });

  it('gets a full case and submits only the admin outcome and conclusion', async () => {
    const detail = api.detail(7);
    http.expectOne(apiConfig.baseUrl + '/admin/booking-disputes/7').flush({ data: sampleCase });
    expect((await detail).ownerEmail).toBe('linh@example.test');
    const resolution = api.resolve(7, 'REOPENED', 'Tiệm tiếp tục phục vụ khách.');
    const request = http.expectOne(apiConfig.baseUrl + '/admin/booking-disputes/7/resolution');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ outcome: 'REOPENED', note: 'Tiệm tiếp tục phục vụ khách.' });
    request.flush({ data: { ...sampleCase, status: 'REOPENED', bookingStatus: 'IN_PROGRESS' } });
    expect((await resolution).bookingStatus).toBe('IN_PROGRESS');
  });
});

describe('Admin booking dispute detail and resolution UI', () => {
  let fixture: ComponentFixture<AdminBookingDisputesComponent>;
  let component: AdminBookingDisputesComponent;
  let root: HTMLElement;
  const api = { list: vi.fn(), detail: vi.fn(), resolve: vi.fn() };
  const clipboard = { copy: vi.fn() };
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); fixture.detectChanges(); };
  const element = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`)!;
  const selectCase = async () => { element<HTMLButtonElement>('case-detail-7').click(); await flush(); };

  beforeEach(async () => {
    vi.resetAllMocks(); api.list.mockResolvedValue(page()); api.detail.mockResolvedValue({ ...sampleCase }); clipboard.copy.mockReturnValue(true);
    await TestBed.configureTestingModule({ imports: [AdminBookingDisputesComponent], providers: [
      provideRouter([]), { provide: AdminBookingDisputesApiService, useValue: api },
      { provide: Clipboard, useValue: clipboard }, { provide: PLATFORM_ID, useValue: 'browser' }
    ] }).compileComponents();
    fixture = TestBed.createComponent(AdminBookingDisputesComponent); component = fixture.componentInstance; root = fixture.nativeElement;
    fixture.detectChanges(); await flush();
  });
  afterEach(() => { fixture.destroy(); TestBed.resetTestingModule(); });

  it('opens the actual case button and shows the complete appointment and both contacts', async () => {
    expect(api.list).toHaveBeenCalledWith('OPEN', 0); expect(component.selected()).toBeNull();
    await selectCase();
    expect(api.detail).toHaveBeenCalledWith(7);
    expect(document.activeElement).toBe(root.querySelector('#case-heading'));
    for (const value of ['Lịch hẹn #19', 'Sơn gel', '60 phút', 'Mai', '0901234567', 'mai@example.test', 'Ellora Nail', '02812345678',
      'tiem@example.test', '12 Đường Hoa', 'Linh', '0912345678', 'linh@example.test', 'Hà', sampleCase.reason]) expect(root.textContent).toContain(value);
    expect(root.querySelector('form[aria-label="Giải quyết phản ánh"]')).not.toBeNull();
    expect(component.formatTime('2026-10-18T14:00:00')).toContain('14:00');
    expect(component.formatTime('2026-10-18T07:00:00Z')).toContain('14:00');
  });

  it('changes the real filter and paginates, clearing a detail from another result set', async () => {
    await selectCase();
    api.list.mockResolvedValueOnce(page([{ ...sampleCase, status: 'UPHELD' }], 0, false));
    const filter = element<HTMLSelectElement>('dispute-filter'); filter.value = 'UPHELD'; filter.dispatchEvent(new Event('change', { bubbles: true })); await flush();
    expect(api.list).toHaveBeenLastCalledWith('UPHELD', 0); expect(component.selected()).toBeNull();
    const next = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.trim() === 'Trang sau')!;
    next.click(); await flush(); expect(api.list).toHaveBeenLastCalledWith('UPHELD', 1);
  });

  it('ignores an older case detail and a response from a previous filter', async () => {
    const oldDetail = deferred<AdminBookingDispute>(); api.detail.mockReturnValueOnce(oldDetail.promise);
    const oldSelection = component.openCase(7);
    api.detail.mockResolvedValueOnce({ ...sampleCase, id: 8, bookingId: 20 }); await component.openCase(8);
    oldDetail.resolve(sampleCase); await oldSelection; expect(component.selected()?.id).toBe(8);
    const oldList = deferred<AdminBookingDisputePage>(); api.list.mockReturnValueOnce(oldList.promise);
    const oldLoad = component.load(); component.filter = 'REOPENED';
    api.list.mockResolvedValueOnce(page([{ ...sampleCase, id: 9, status: 'REOPENED' }])); await component.load();
    oldList.resolve(page()); await oldLoad; expect(component.cases().map(item => item.id)).toEqual([9]);
  });

  it('rejects missing and oversized conclusions without submitting a resolution', async () => {
    await selectCase(); component.note = '   '; await component.resolve();
    expect(api.resolve).not.toHaveBeenCalled(); expect(component.resolutionError()).toContain('2000');
    component.note = 'a'.repeat(2001); await component.resolve(); expect(api.resolve).not.toHaveBeenCalled();
    fixture.detectChanges(); expect(element<HTMLTextAreaElement>('resolution-note').maxLength).toBe(2000);
  });

  it('submits the real resolution form, prevents duplicate actions and preserves the draft on failure', async () => {
    await selectCase(); const pending = deferred<AdminBookingDispute>(); api.resolve.mockReturnValueOnce(pending.promise);
    const note = element<HTMLTextAreaElement>('resolution-note'); note.value = '  Khách chưa được phục vụ xong.  '; note.dispatchEvent(new Event('input', { bubbles: true }));
    const outcome = element<HTMLSelectElement>('resolution-outcome'); outcome.value = 'REOPENED'; outcome.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges(); root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush();
    expect(api.resolve).toHaveBeenCalledWith(7, 'REOPENED', 'Khách chưa được phục vụ xong.');
    expect(root.querySelector('fieldset')!.disabled).toBe(true);
    await component.resolve(); await component.load(); await component.openCase(8); expect(api.resolve).toHaveBeenCalledTimes(1);
    pending.reject(new HttpErrorResponse({ status: 409, error: { message: 'Một admin khác đã xử lý. Hãy tải lại.' } })); await flush();
    expect(component.note).toBe('  Khách chưa được phục vụ xong.  '); expect(component.outcome).toBe('REOPENED');
    expect(component.resolutionError()).toContain('admin khác'); expect(component.resolving()).toBe(false);
  });

  it.each(['UPHELD', 'REOPENED'] as const)('keeps the resolved %s detail and removes it from the open queue', async status => {
    await selectCase(); component.note = 'Đã liên hệ hai bên.'; component.outcome = status;
    api.list.mockResolvedValueOnce(page([]));
    api.resolve.mockResolvedValue({ ...sampleCase, status, bookingStatus: status === 'REOPENED' ? 'IN_PROGRESS' : 'COMPLETED',
      adminNote: component.note, resolvedAt: '2026-10-18T16:00:00', resolvedBy: 'admin-id' });
    await component.resolve(); fixture.detectChanges();
    expect(component.selected()?.status).toBe(status); expect(component.cases()).toEqual([]); expect(component.total()).toBe(0);
    expect(root.querySelector('form')).toBeNull(); expect(root.textContent).toContain('Đã liên hệ hai bên.');
    expect(root.textContent).toContain('admin-id');
    expect(component.message()).toContain(status === 'REOPENED' ? 'Đang thực hiện' : 'Hoàn thành');
  });

  it('refills the resolved page before navigating so the next offset does not skip an open case', async () => {
    const rows = Array.from({ length: 41 }, (_, index) => ({ ...sampleCase, id: index + 1, bookingId: index + 101 }));
    api.list.mockResolvedValueOnce({ ...page(rows.slice(0, 20), 0, false), totalElements: 41 });
    await component.load(); await selectCase(); component.note = 'Đã kiểm tra hai bên.';
    api.resolve.mockResolvedValue({ ...sampleCase, status: 'UPHELD', adminNote: component.note });
    const remaining = rows.filter(item => item.id !== sampleCase.id);
    const refresh = deferred<AdminBookingDisputePage>(); api.list.mockReturnValueOnce(refresh.promise);
    const resolving = component.resolve(); await flush();
    expect(component.resolving()).toBe(true); expect(component.selected()?.status).toBe('UPHELD');
    expect(element<HTMLSelectElement>('dispute-filter').disabled).toBe(true);
    refresh.resolve({ ...page(remaining.slice(0, 20), 0, false), totalElements: 40 }); await resolving; fixture.detectChanges();
    expect(component.cases()).toHaveLength(20); expect(component.cases().at(-1)?.id).toBe(21);
    expect(component.selected()?.id).toBe(7); expect(component.selected()?.status).toBe('UPHELD');
    api.list.mockResolvedValueOnce({ ...page(remaining.slice(20), 1, true), totalElements: 40 });
    const next = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.trim() === 'Trang sau')!;
    next.click(); await flush();
    expect(api.list).toHaveBeenLastCalledWith('OPEN', 1); expect(component.cases()[0].id).toBe(22);
    expect(component.cases()).toHaveLength(20);
  });

  it('keeps successful resolution details and conclusion when refreshing the list fails', async () => {
    api.list.mockResolvedValueOnce({ ...page([sampleCase], 0, false), totalElements: 21 }); await component.load(); fixture.detectChanges();
    await selectCase(); component.note = 'Tiệm tiếp tục phục vụ khách.'; component.outcome = 'REOPENED';
    api.resolve.mockResolvedValue({ ...sampleCase, status: 'REOPENED', bookingStatus: 'IN_PROGRESS', adminNote: component.note });
    api.list.mockRejectedValueOnce(new Error('offline')); await component.resolve(); fixture.detectChanges();
    expect(component.selected()?.status).toBe('REOPENED'); expect(component.selected()?.adminNote).toBe('Tiệm tiếp tục phục vụ khách.');
    expect(component.message()).toContain('Đã lưu kết luận'); expect(component.error()).toContain('chưa tải lại được danh sách');
    expect(component.resolutionError()).toBe(''); expect(component.resolving()).toBe(false);
    expect(root.querySelector('form')).toBeNull();
    expect(Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.trim() === 'Trang sau')!.disabled).toBe(true);
  });

  it('moves back one page when resolving the last case empties the current page', async () => {
    api.list.mockResolvedValueOnce({ ...page([sampleCase], 1, true), totalElements: 21 }); await component.load(1);
    await selectCase(); component.note = 'Đã xác minh hoàn thành.';
    api.resolve.mockResolvedValue({ ...sampleCase, status: 'UPHELD', adminNote: component.note });
    api.list.mockResolvedValueOnce({ ...page([], 1, true), totalElements: 20 });
    api.list.mockResolvedValueOnce({ ...page([{ ...sampleCase, id: 8 }], 0, true), totalElements: 20 });
    await component.resolve();
    expect(api.list).toHaveBeenNthCalledWith(3, 'OPEN', 1); expect(api.list).toHaveBeenLastCalledWith('OPEN', 0);
    expect(component.page()).toBe(0); expect(component.selected()?.status).toBe('UPHELD'); expect(component.cases()[0].id).toBe(8);
  });

  it('copies customer phone, falls back to the owner phone and includes every contact in the full case', async () => {
    api.detail.mockResolvedValueOnce({ ...sampleCase, salonPhone: null }); await selectCase();
    element<HTMLButtonElement>('copy-customer-phone').click(); expect(clipboard.copy).toHaveBeenLastCalledWith('0901234567');
    const salonCopy = element<HTMLButtonElement>('copy-salon-phone'); expect(salonCopy.textContent).toContain('chủ tiệm');
    salonCopy.click(); expect(clipboard.copy).toHaveBeenLastCalledWith('0912345678');
    element<HTMLButtonElement>('copy-full-case').click();
    const text = clipboard.copy.mock.calls.at(-1)![0] as string;
    for (const value of ['Lịch hẹn #19', 'Sơn gel', '60 phút', '14:00', 'mai@example.test', 'tiem@example.test', 'linh@example.test',
      '0901234567', '0912345678', '12 Đường Hoa', sampleCase.reason]) expect(text).toContain(value);
    fixture.detectChanges(); expect(root.textContent).toContain('Đã sao chép toàn bộ');
  });

  it('disables unavailable phone actions and reports clipboard failure honestly', async () => {
    api.detail.mockResolvedValueOnce({ ...sampleCase, customerPhone: null, salonPhone: null, ownerPhone: null }); await selectCase();
    expect(element<HTMLButtonElement>('copy-customer-phone').disabled).toBe(true); expect(element<HTMLButtonElement>('copy-salon-phone').disabled).toBe(true);
    expect(root.textContent).toContain('Chưa cung cấp'); clipboard.copy.mockReturnValue(false);
    element<HTMLButtonElement>('copy-full-case').click(); fixture.detectChanges();
    expect(root.textContent).toContain('Không sao chép được'); expect(component.copyFailed()).toBe(true);
  });

  it('shows retryable list and detail errors instead of pretending loading succeeded', async () => {
    api.detail.mockRejectedValueOnce(new Error('offline')); await selectCase();
    expect(component.selected()).toBeNull(); expect(component.detailError()).not.toBe('');
    const retry = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.trim() === 'Thử lại')!;
    retry.click(); await flush(); expect(component.selected()?.id).toBe(7);
    api.list.mockRejectedValueOnce(new HttpErrorResponse({ status: 403 })); await component.load();
    expect(component.cases()).toEqual([]); expect(component.error()).toContain('quyền');
  });

  it('ignores a pending detail after destruction', async () => {
    const pending = deferred<AdminBookingDispute>(); api.detail.mockReturnValueOnce(pending.promise);
    const selection = component.openCase(7); component.ngOnDestroy(); pending.resolve(sampleCase); await selection;
    expect(component.selected()).toBeNull();
  });
});
