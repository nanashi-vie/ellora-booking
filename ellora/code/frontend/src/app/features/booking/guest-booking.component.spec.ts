import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingComponent } from './booking.component';
import { SalonApiService } from '../../services/salon-api.service';
import { BookingApiService, GuestBookingReceipt } from '../../services/booking-api.service';
import { AuthService } from '../../services/auth.service';
import { apiConfig } from '../../config/api.config';

const receipt: GuestBookingReceipt = {
  id: 123, status: 'PENDING', scheduledAt: '2026-10-19T11:37:00', salonName: 'Ellora Nail', serviceName: 'Sơn gel'
};

describe('Public guest booking and registered customer compatibility', () => {
  let fixture: ComponentFixture<BookingComponent>;
  const salonApi = { detail: vi.fn(), services: vi.fn(), employees: vi.fn(), workingHours: vi.fn(), closedDates: vi.fn() };
  const bookingApi = { createGuestBooking: vi.fn(), createBooking: vi.fn() };
  const auth = { isAuthenticated: vi.fn(), getUserProfile: vi.fn() };
  const router = { navigate: vi.fn() };
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); fixture.detectChanges(); };
  const render = async () => {
    fixture = TestBed.createComponent(BookingComponent); fixture.detectChanges(); await flush();
    const component = fixture.componentInstance;
    component.selectedDate.set('2026-10-19'); component.selectedTime.set('11:37'); component.selectedStaffId.set('any');
    component.currentStep.set(4); fixture.detectChanges();
    return { component, root: fixture.nativeElement as HTMLElement };
  };
  const input = (root: HTMLElement, id: string, value: string) => {
    const field = root.querySelector<HTMLInputElement>(`#${id}`)!;
    field.value = value; field.dispatchEvent(new Event('input')); field.dispatchEvent(new Event('blur'));
  };
  const fillGuest = (root: HTMLElement) => {
    input(root, 'booking-name', '  Nguyễn Mai  '); input(root, 'booking-phone', ' 0900123456 ');
    input(root, 'booking-email', ' mai@example.com '); input(root, 'booking-notes', 'Màu hồng nhẹ');
  };

  beforeEach(async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-18T03:00:00Z')); vi.resetAllMocks();
    salonApi.detail.mockResolvedValue({ id: '1', name: 'Ellora Nail', images: [] });
    salonApi.services.mockResolvedValue([{ id: '2', salonId: '1', name: 'Sơn gel', description: '', durationMinutes: 60, price: 150000 }]);
    salonApi.employees.mockResolvedValue([]);
    salonApi.workingHours.mockResolvedValue([{ dayOfWeek: 'MONDAY', openTime: '09:00:00', closeTime: '19:00:00', closed: false }]);
    salonApi.closedDates.mockResolvedValue([]); auth.isAuthenticated.mockResolvedValue(false);
    auth.getUserProfile.mockResolvedValue({ name: 'Khách đăng nhập', phone_number: '0912345678', email: 'account@example.com' });
    bookingApi.createGuestBooking.mockResolvedValue(receipt); bookingApi.createBooking.mockResolvedValue({ id: 124 });
    router.navigate.mockResolvedValue(true);
    TestBed.configureTestingModule({ imports: [BookingComponent], providers: [
      { provide: SalonApiService, useValue: salonApi }, { provide: BookingApiService, useValue: bookingApi },
      { provide: AuthService, useValue: auth }, { provide: Router, useValue: router },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ salonId: '1', serviceId: '2' }) } } }
    ] });
    await TestBed.compileComponents();
  });
  afterEach(() => { fixture?.destroy(); TestBed.resetTestingModule(); vi.useRealTimers(); });

  it('loads public salon data while auth is pending, blocks early submission, and never fetches a guest profile', async () => {
    let resolveAuth!: (authenticated: boolean) => void;
    auth.isAuthenticated.mockReturnValueOnce(new Promise<boolean>(resolve => { resolveAuth = resolve; }));
    const { component, root } = await render();
    expect(component.salon()?.name).toBe('Ellora Nail'); expect(component.authReady()).toBe(false);
    expect(root.querySelector<HTMLButtonElement>('.btn-pay')!.disabled).toBe(true);
    await component.confirmBooking(); expect(bookingApi.createGuestBooking).not.toHaveBeenCalled();
    resolveAuth(false); await flush();
    expect(component.guestMode()).toBe(true); expect(component.authReady()).toBe(true);
    expect(root.querySelector<HTMLInputElement>('#booking-email')!.required).toBe(true);
    expect(auth.getUserProfile).not.toHaveBeenCalled();
  });

  it('requires nonblank name, valid phone, and email and renders accessible field errors', async () => {
    const { component, root } = await render();
    input(root, 'booking-name', '   '); input(root, 'booking-phone', '0900123456');
    await component.confirmBooking(); fixture.detectChanges();
    expect(root.querySelector('#booking-name-error')!.textContent).toContain('họ tên');
    expect(root.querySelector('#booking-email-error')!.textContent).toContain('email hợp lệ');
    expect(root.querySelector('#booking-name')!.getAttribute('aria-invalid')).toBe('true');
    input(root, 'booking-name', 'Mai'); input(root, 'booking-email', 'invalid-email'); input(root, 'booking-phone', '    ');
    await component.confirmBooking(); fixture.detectChanges();
    expect(root.querySelector('#booking-phone-error')).not.toBeNull();
    expect(bookingApi.createGuestBooking).not.toHaveBeenCalled(); expect(bookingApi.createBooking).not.toHaveBeenCalled();
  });

  it('matches the API email limit of 254 characters in the input and form validator', async () => {
    const { component, root } = await render();
    expect(root.querySelector<HTMLInputElement>('#booking-email')!.maxLength).toBe(254);
    const email = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
    expect(email.length).toBe(254); component.customerForm.controls.email.setValue(email);
    expect(component.customerForm.controls.email.valid).toBe(true);
    component.customerForm.controls.email.setValue(email + 'd');
    expect(component.customerForm.controls.email.getError('maxlength')).toEqual({ requiredLength: 254, actualLength: 255 });
  });

  it('submits trimmed guest contacts and shows the receipt without an account-history redirect or countdown', async () => {
    const { component, root } = await render(); fillGuest(root);
    root.querySelector<HTMLButtonElement>('.btn-pay')!.click(); await flush();
    expect(bookingApi.createGuestBooking).toHaveBeenCalledExactlyOnceWith({
      salonId: 1, serviceId: 2, employeeId: undefined, scheduledAt: '2026-10-19T11:37:00',
      customerNote: 'Màu hồng nhẹ', fullName: 'Nguyễn Mai', phone: '0900123456', email: 'mai@example.com'
    });
    expect(bookingApi.createBooking).not.toHaveBeenCalled();
    const modal = root.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(modal.getAttribute('aria-modal')).toBe('true');
    for (const text of ['#123', 'Ellora Nail', 'Sơn gel', '11:37 • 19/10/2026', 'mai@example.com', 'Chờ tiệm xác nhận']) expect(modal.textContent).toContain(text);
    expect(modal.textContent).not.toContain('lịch sử'); expect(modal.querySelector('.success-modal__countdown')).toBeNull();
    vi.advanceTimersByTime(31000); await flush(); expect(router.navigate).not.toHaveBeenCalled();
    await component.confirmBooking(); expect(bookingApi.createGuestBooking).toHaveBeenCalledTimes(1);
    modal.querySelector<HTMLButtonElement>('.btn-view-bookings')!.click(); await flush();
    expect(router.navigate).toHaveBeenCalledWith(['/salon', '1']);
  });

  it('blocks duplicate requests and ignores a guest response after the page is destroyed', async () => {
    let resolveBooking!: (value: GuestBookingReceipt) => void;
    bookingApi.createGuestBooking.mockReturnValueOnce(new Promise<GuestBookingReceipt>(resolve => { resolveBooking = resolve; }));
    const { component, root } = await render(); fillGuest(root);
    const pending = component.confirmBooking(); await component.confirmBooking(); fixture.detectChanges();
    expect(bookingApi.createGuestBooking).toHaveBeenCalledTimes(1); expect(root.querySelector<HTMLButtonElement>('.btn-pay')!.disabled).toBe(true);
    fixture.destroy(); resolveBooking(receipt); await pending;
    expect(component.guestReceipt()).toBeNull(); expect(component.showSuccessPopup()).toBe(false); expect(router.navigate).not.toHaveBeenCalled();
  });

  it('preserves guest details after a throttled request and allows retry with a friendly message', async () => {
    bookingApi.createGuestBooking.mockRejectedValueOnce(new HttpErrorResponse({ status: 429, error: { message: 'Internal rate limit detail' } }));
    const { component, root } = await render(); fillGuest(root); await component.confirmBooking(); fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')!.textContent).toContain('Vui lòng thử lại sau ít phút');
    expect(root.textContent).not.toContain('Internal rate limit detail'); expect(component.saving()).toBe(false);
    expect(component.customerForm.getRawValue()).toEqual({ fullName: '  Nguyễn Mai  ', phone: ' 0900123456 ', email: 'mai@example.com', notes: 'Màu hồng nhẹ' });
    expect(component.showSuccessPopup()).toBe(false);
    await component.confirmBooking(); expect(component.guestReceipt()?.id).toBe(123); expect(bookingApi.createGuestBooking).toHaveBeenCalledTimes(2);
  });

  it('keeps registered prefill, protected createBooking, optional profile email, and history countdown', async () => {
    auth.isAuthenticated.mockResolvedValueOnce(true);
    const { component, root } = await render();
    expect(component.guestMode()).toBe(false); expect(auth.getUserProfile).toHaveBeenCalledTimes(1);
    expect(component.customerForm.controls.fullName.value).toBe('Khách đăng nhập');
    expect(root.querySelector('#booking-email')).toBeNull(); expect(root.textContent).toContain('account@example.com');
    await component.confirmBooking(); fixture.detectChanges();
    expect(bookingApi.createBooking).toHaveBeenCalledExactlyOnceWith({ salonId: 1, serviceId: 2, employeeId: undefined,
      scheduledAt: '2026-10-19T11:37:00', customerNote: '', customerPhone: '0912345678' });
    expect(bookingApi.createGuestBooking).not.toHaveBeenCalled();
    expect(root.querySelector('.success-modal__countdown')).not.toBeNull();
    vi.advanceTimersByTime(30000); await flush(); expect(router.navigate).toHaveBeenCalledWith(['/setting/my-bookings']);
  });

  it('does not overwrite contact fields edited while a registered profile was loading', async () => {
    let resolveProfile!: (value: { name: string; phone_number: string; email: string }) => void;
    auth.isAuthenticated.mockResolvedValueOnce(true);
    auth.getUserProfile.mockReturnValueOnce(new Promise(resolve => { resolveProfile = resolve; }));
    const { component, root } = await render();
    input(root, 'booking-name', 'Tên khách đã sửa'); input(root, 'booking-phone', '0900000001');
    resolveProfile({ name: 'Tên hồ sơ', phone_number: '0900000002', email: 'profile@example.com' }); await flush();
    expect(component.customerForm.controls.fullName.value).toBe('Tên khách đã sửa');
    expect(component.customerForm.controls.phone.value).toBe('0900000001'); expect(component.authReady()).toBe(true);
  });

  it('lets registered customers enter details after profile failure and never falls back to the guest endpoint', async () => {
    auth.isAuthenticated.mockResolvedValueOnce(true); auth.getUserProfile.mockRejectedValueOnce(new Error('profile unavailable'));
    bookingApi.createBooking.mockRejectedValueOnce(new HttpErrorResponse({ status: 401 }));
    const { component, root } = await render();
    input(root, 'booking-name', 'Mai'); input(root, 'booking-phone', '0900123456');
    await component.confirmBooking();
    expect(component.authReady()).toBe(true); expect(component.guestMode()).toBe(false);
    expect(bookingApi.createBooking).toHaveBeenCalledTimes(1); expect(bookingApi.createGuestBooking).not.toHaveBeenCalled();
    expect(component.showSuccessPopup()).toBe(false); expect(component.error()).toContain('Không đặt được lịch');
  });
});

describe('Guest booking API contract', () => {
  let requests: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    requests = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { requests.verify(); TestBed.resetTestingModule(); });
  it('posts guest fields to the public endpoint and unwraps its minimal receipt', async () => {
    const payload = { salonId: 1, serviceId: 2, scheduledAt: receipt.scheduledAt, fullName: 'Mai', phone: '0900123456', email: 'mai@example.com' };
    const pending = TestBed.inject(BookingApiService).createGuestBooking(payload);
    const request = requests.expectOne(apiConfig.baseUrl + '/bookings/guest');
    expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual(payload);
    request.flush({ success: true, message: '', data: receipt }); expect(await pending).toEqual(receipt);
  });
});
