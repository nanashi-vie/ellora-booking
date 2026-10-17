import { Component, inject, signal, computed, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { SalonApiService, SalonWorkingHour } from '../../services/salon-api.service';
import { HttpErrorResponse } from '@angular/common/http';
import { BookingApiService } from '../../services/booking-api.service';
import { Salon, Service, Staff } from '../../models/ellora.model';
import { AuthService } from '../../services/auth.service';

interface CalendarDay {
  date: number;
  fullDate: string; // 'YYYY-MM-DD'
  isCurrentMonth: boolean;
  isPast: boolean;
}

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './booking.component.html',
  styleUrl: './booking.component.scss'
})
export class BookingComponent implements OnInit, OnDestroy {
  private salonApi = inject(SalonApiService);
  private bookingApi = inject(BookingApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);

  // Data
  salon = signal<Salon | null>(null);
  services = signal<Service[]>([]);
  staffList = signal<Staff[]>([]);
  error = signal('');
  saving = signal(false);
  readonly workingHours = signal<SalonWorkingHour[]>([]);
  readonly closedDates = signal<string[]>([]);
  readonly closuresLoading = signal(false);
  readonly closuresError = signal('');
  private closureRequest = 0;
  private readonly bookingNow = signal(Date.now());
  readonly earliestBooking = computed(() => {
    const instant = new Date(Math.ceil((this.bookingNow() + 60 * 60 * 1000) / 60000) * 60000);
    const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
    const part = (name: string) => parts.find(item => item.type === name)!.value;
    return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
  });

  // Wizard state: 1=Dịch vụ, 2=Thợ nail, 3=Thời gian, 4=Xác nhận
  currentStep = signal<1 | 2 | 3 | 4>(1);

  // Step 1: Services
  selectedServiceIds = signal<string[]>([]);

  // Step 2: Staff
  selectedStaffId = signal<string | null>(null);

  // Step 3: Date/Time
  calendarYear = signal(Number(this.earliestBooking().date.slice(0, 4)));
  calendarMonth = signal(Number(this.earliestBooking().date.slice(5, 7)) - 1); // 0-indexed
  selectedDate = signal<string | null>(null);
  selectedTime = signal<string | null>(null);

  // Popup & Countdown
  showSuccessPopup = signal(false);
  countdown = signal(30);
  private countdownTimer: any;

  // Step 4: Form
  customerForm = this.fb.nonNullable.group({
    fullName: ['', Validators.required],
    phone: ['', [Validators.required, Validators.pattern(/^[+0-9 ()-]{8,20}$/), Validators.pattern(/\d/)]],
    notes: ['']
  });

  async ngOnInit() {
    this.refreshBookingTime();
    const salonId = this.route.snapshot.queryParamMap.get('salonId');
    if (!salonId) {
      this.error.set('Vui lòng chọn salon trước khi đặt lịch.');
      return;
    }
    try {
      const [salon, services, staff, hours] = await Promise.all([
        this.salonApi.detail(salonId), this.salonApi.services(salonId), this.salonApi.employees(salonId), this.salonApi.workingHours(salonId)
      ]);
      this.salon.set(salon); this.services.set(services); this.staffList.set(staff);
      this.workingHours.set(hours);
      void this.loadClosedDates();
      const serviceId = this.route.snapshot.queryParamMap.get('serviceId');
      if (serviceId && services.some(service => service.id === serviceId)) this.selectedServiceIds.set([serviceId]);
    } catch { this.error.set('Không tải được thông tin salon. Vui lòng thử lại.'); }
    try {
      const profile = await this.authService.getUserProfile();
      this.customerForm.patchValue({
        fullName: profile.name || '',
        phone: profile.phone_number || ''
      });
    } catch { /* Profile details are optional for the booking form. */ }
  }

  // ─── Computed ───────────────────────────────────────

  selectedServices = computed(() =>
    this.services().filter(s => this.selectedServiceIds().includes(s.id))
  );

  totalPrice = computed(() =>
    this.selectedServices().reduce((sum, s) => sum + s.price, 0)
  );

  selectedStaff = computed(() =>
    this.staffList().find(s => s.id === this.selectedStaffId())
  );

  calendarMonthLabel = computed(() => {
    const d = new Date(this.calendarYear(), this.calendarMonth(), 1);
    return d.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
  });

  calendarDays = computed<CalendarDay[]>(() => {
    const year = this.calendarYear();
    const month = this.calendarMonth();
    const earliestDate = this.earliestBooking().date;

    const firstDay = new Date(year, month, 1);
    // Mon=0 … Sun=6 offset
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: CalendarDay[] = [];

    // Prev month filler
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, daysInPrevMonth - i);
      days.push({ date: daysInPrevMonth - i, fullDate: this.toISODate(d), isCurrentMonth: false, isPast: this.toISODate(d) < earliestDate });
    }
    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      days.push({ date: i, fullDate: this.toISODate(d), isCurrentMonth: true, isPast: this.toISODate(d) < earliestDate });
    }
    // Next month filler to complete last row
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const d = new Date(year, month + 1, i);
        days.push({ date: i, fullDate: this.toISODate(d), isCurrentMonth: false, isPast: this.toISODate(d) < earliestDate });
      }
    }
    return days;
  });

  isClosed(date: string): boolean {
    const weekday = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date(date + 'T00:00:00Z').getUTCDay()];
    return this.closedDates().includes(date) || !this.workingHours().some(row => row.dayOfWeek === weekday && !row.closed);
  }

  readonly timeRange = computed(() => {
    const date = this.selectedDate();
    const earliest = this.earliestBooking();
    if (!date || date < earliest.date || this.isClosed(date) || this.closuresLoading() || this.closuresError()) return null;
    const weekday = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date(date + 'T00:00:00Z').getUTCDay()];
    const hours = this.workingHours().find(row => row.dayOfWeek === weekday);
    if (!hours?.openTime || !hours.closeTime) return null;
    const duration = this.selectedServices().reduce((total, service) => total + service.durationMinutes, 0);
    if (duration <= 0) return null;
    const min = Math.max(this.minutes(hours.openTime), date === earliest.date ? this.minutes(earliest.time) : 0);
    const max = this.minutes(hours.closeTime) - duration;
    return min <= max ? { min: this.formatMinutes(min), max: this.formatMinutes(max) } : null;
  });
  readonly selectedTimeValid = computed(() => {
    const time = this.selectedTime(); const range = this.timeRange();
    return !!time && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) && !!range && time >= range.min && time <= range.max;
  });
  readonly availableSlots = computed(() => {
    const range = this.timeRange();
    if (!range) return [];
    const slots: string[] = [];
    for (let time = Math.ceil(this.minutes(range.min) / 30) * 30; time <= this.minutes(range.max); time += 30) slots.push(this.formatMinutes(time));
    return slots;
  });
  readonly morningSlots = computed(() => this.availableSlots().filter(time => time < '12:00'));
  readonly afternoonSlots = computed(() => this.availableSlots().filter(time => time >= '12:00'));

  async loadClosedDates(): Promise<void> {
    const salon = this.salon();
    if (!salon) return;
    const request = ++this.closureRequest;
    const days = this.calendarDays();
    this.closuresLoading.set(true); this.closuresError.set('');
    try {
      const dates = await this.salonApi.closedDates(salon.id, days[0].fullDate, days[days.length - 1].fullDate);
      if (request !== this.closureRequest) return;
      this.closedDates.set(dates);
      if (this.selectedDate() && this.isClosed(this.selectedDate()!)) { this.selectedDate.set(null); this.selectedTime.set(null); }
    } catch { if (request === this.closureRequest) this.closuresError.set('Không tải được ngày nghỉ của tiệm. Vui lòng thử lại.'); }
    finally { if (request === this.closureRequest) this.closuresLoading.set(false); }
  }

  selectedDateLabel = computed(() => {
    if (!this.selectedDate()) return '';
    const [y, m, d] = this.selectedDate()!.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' });
  });

  // ─── Helpers ────────────────────────────────────────

  private toISODate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private minutes(time: string): number { return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)); }
  private formatMinutes(time: number): string { return `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`; }
  refreshBookingTime(): void { this.bookingNow.set(Date.now()); }
  selectDate(date: string): void {
    this.refreshBookingTime();
    if (date < this.earliestBooking().date || this.isClosed(date)) return;
    this.selectedDate.set(date); this.selectedTime.set(null); this.error.set('');
  }
  selectTime(time: string): void { this.refreshBookingTime(); this.selectedTime.set(time); this.error.set(''); }

  formatPrice(p: number): string {
    return p.toLocaleString('vi-VN') + 'đ';
  }

  // ─── Actions ────────────────────────────────────────

  toggleService(id: string) {
    this.selectedServiceIds.update(ids => ids.includes(id) ? [] : [id]);
    this.selectedTime.set(null);
  }

  prevMonth() {
    this.selectedDate.set(null); this.selectedTime.set(null);
    if (this.calendarMonth() === 0) {
      this.calendarMonth.set(11);
      this.calendarYear.update(y => y - 1);
    } else {
      this.calendarMonth.update(m => m - 1);
    }
    void this.loadClosedDates();
  }

  nextMonth() {
    this.selectedDate.set(null); this.selectedTime.set(null);
    if (this.calendarMonth() === 11) {
      this.calendarMonth.set(0);
      this.calendarYear.update(y => y + 1);
    } else {
      this.calendarMonth.update(m => m + 1);
    }
    void this.loadClosedDates();
  }

  nextStep() {
    this.refreshBookingTime();
    const step = this.currentStep();
    if (step === 1 && this.selectedServiceIds().length > 0) this.currentStep.set(2);
    else if (step === 2 && this.selectedStaffId()) this.currentStep.set(3);
    else if (step === 3 && this.selectedTimeValid()) this.currentStep.set(4);
    else if (step === 3) this.error.set('Chọn giờ hẹn cách hiện tại ít nhất 1 tiếng và nằm trong giờ mở cửa.');
  }

  prevStep() {
    const step = this.currentStep();
    if (step > 1) this.currentStep.set((step - 1) as 1 | 2 | 3 | 4);
  }

  goToStep(step: number) {
    if (step < this.currentStep()) {
      this.currentStep.set(step as 1 | 2 | 3 | 4);
    }
  }


  async confirmBooking() {
    this.refreshBookingTime();
    this.customerForm.markAllAsTouched();
    if (this.customerForm.invalid) { this.error.set('Vui lòng nhập họ tên và số điện thoại hợp lệ.'); return; }
    if (!this.salon() || !this.selectedServiceIds()[0] || !this.selectedDate() || !this.selectedTime() || this.saving()) return;
    if (!this.selectedTimeValid()) { this.error.set('Vui lòng chọn lại giờ hẹn, cách hiện tại ít nhất 1 tiếng và đủ thời lượng dịch vụ trước giờ đóng cửa.'); return; }
    this.saving.set(true); this.error.set('');
    try {
      await this.bookingApi.createBooking({
        salonId: Number(this.salon()!.id),
        serviceId: Number(this.selectedServiceIds()[0]),
        employeeId: this.selectedStaffId() && this.selectedStaffId() !== 'any' ? Number(this.selectedStaffId()) : undefined,
        scheduledAt: `${this.selectedDate()}T${this.selectedTime()}:00`,
        customerNote: this.customerForm.controls.notes.value,
        customerPhone: this.customerForm.controls.phone.value.trim(),
      });
    } catch (error) {
      this.error.set(error instanceof HttpErrorResponse && error.status === 400 && typeof error.error?.message === 'string'
        ? error.error.message : 'Không đặt được lịch. Vui lòng kiểm tra thời gian và thử lại.');
      this.saving.set(false);
      return;
    }
    this.saving.set(false);
    this.showSuccessPopup.set(true);
    this.countdown.set(30);
    this.startCountdown();
  }

  startCountdown() {
    this.countdownTimer = setInterval(() => {
      this.countdown.update(c => c - 1);
      if (this.countdown() <= 0) {
        this.closeSuccessPopupAndRedirect();
      }
    }, 1000);
  }

  closeSuccessPopupAndRedirect() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.showSuccessPopup.set(false);
    this.router.navigate(['/setting/my-bookings']);
  }

  ngOnDestroy() {
    this.closureRequest++;
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }

  trackByFn(_: number, item: { id: string }) { return item.id; }
}
