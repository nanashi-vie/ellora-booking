import { Component, computed, inject, signal, effect, ElementRef, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { BookingService, BookingEvent } from '../../../services/booking.service';
import { OwnerApiService, OwnerService, OwnerEmployee } from '../../../services/owner-api.service';
import { BookingItem } from '../../../services/booking-api.service';
import { WalkInFormComponent } from './walk-in-form.component';
import { vnDate } from '../../../services/billing-api.service';
import { BookingContactComponent } from '../../../shared/components/booking-contact.component';

export interface Staff {
  id: number;
  name: string;
  role: string;
  avatar: string;
}

@Component({
  selector: 'app-booking-management',
  standalone: true,
  imports: [CommonModule, WalkInFormComponent, CdkTrapFocus, BookingContactComponent],
  templateUrl: './booking-management.component.html',
  styleUrl: './booking-management.component.scss'
})
export class BookingManagement implements OnInit {
  readonly selectedDate = signal(vnDate());
  readonly viewMode = signal<'day' | 'week'>('day');
  readonly weekDays = computed(() => {
    const date = new Date(`${this.selectedDate()}T00:00:00Z`);
    const monday = this.addDays(this.selectedDate(), -((date.getUTCDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => {
      const day = this.addDays(monday, index);
      return { date: day, label: this.formatDate(day, { weekday: 'short', day: '2-digit', month: '2-digit' }) };
    });
  });
  readonly currentDate = computed(() => this.viewMode() === 'day'
    ? this.formatDate(this.selectedDate(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : `${this.formatDate(this.weekDays()[0].date)} – ${this.formatDate(this.weekDays()[6].date)}`);
  
  // 1 hour = 100px
  hourHeight = 120;
  startHour = 8; // 8 AM
  endHour = 16;  // 4 PM
  
  hours = Array.from({ length: this.endHour - this.startHour + 1 }, (_, i) => this.startHour + i);

  isSidebarOpen = false;
  readonly walkInServices = signal<OwnerService[]>([]);
  readonly walkInEmployees = signal<OwnerEmployee[]>([]);
  readonly walkInSaving = signal(false);
  readonly message = signal('');

  staffs = signal<Staff[]>([{ id: 0, name: 'Chưa phân công', role: '', avatar: '/salon-placeholder.svg' }]);

  readonly bookingService = inject(BookingService);
  private readonly ownerApi = inject(OwnerApiService);
  private readonly elementRef = inject(ElementRef);
  private readonly platformId = inject(PLATFORM_ID);
  
  bookings = this.bookingService.bookings;
  error = this.bookingService.error;
  readonly periodBookings = computed(() => {
    const first = this.viewMode() === 'day' ? this.selectedDate() : this.weekDays()[0].date;
    const last = this.viewMode() === 'day' ? first : this.weekDays()[6].date;
    return this.bookings().filter(item => item.date >= first && item.date <= last && (item.status === 'pending' || item.status === 'confirmed'))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime - b.startTime || a.id - b.id);
  });
  readonly activeBookings = this.periodBookings;

  async ngOnInit(): Promise<void> {
    void this.bookingService.loadSalonBookings();
    try {
      const [services, employees, hours] = await Promise.all([this.ownerApi.services(), this.ownerApi.employees(), this.ownerApi.workingHours()]);
      const openDays = hours.filter(day => !day.closed && day.openTime && day.closeTime);
      if (openDays.length) {
        const hour = (time: string) => Number(time.slice(0, 2)) + Number(time.slice(3, 5)) / 60;
        this.startHour = Math.floor(Math.min(...openDays.map(day => hour(day.openTime!))));
        this.endHour = Math.ceil(Math.max(...openDays.map(day => hour(day.closeTime!))));
        this.hours = Array.from({ length: this.endHour - this.startHour + 1 }, (_, index) => this.startHour + index);
      }
      this.walkInServices.set(services.filter(service => service.active));
      this.walkInEmployees.set(employees.filter(employee => employee.active));
      this.staffs.set([{ id: 0, name: 'Chưa phân công', role: '', avatar: '/salon-placeholder.svg' }, ...employees.map(employee => ({
        id: employee.id, name: employee.fullName, role: employee.bio, avatar: employee.avatarUrl || '/salon-placeholder.svg'
      }))]);
    } catch { this.error.set('Không tải được dữ liệu nhân viên hoặc dịch vụ.'); }
  }

  constructor() {
    effect((onCleanup) => {
      const focusedId = this.bookingService.focusedBookingId();
      const booking = this.bookings().find(item => item.id === focusedId);
      if (!booking) return;
      if (booking.status !== 'pending' && booking.status !== 'confirmed') {
        this.bookingService.focusedBookingId.set(null);
        return;
      }
      this.selectedDate.set(booking.date);
      this.viewMode.set('day');
      this.staffs(); // Re-render the target after its employee column loads.
      if (!isPlatformBrowser(this.platformId)) return;
      let element: HTMLElement | null = null;
      let clearHighlight: ReturnType<typeof setTimeout> | undefined;
      const scroll = setTimeout(() => {
        element = this.elementRef.nativeElement.querySelector(`#booking-${focusedId}`);
        if (!element) return;
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('highlight-pulse');
        clearHighlight = setTimeout(() => {
          element?.classList.remove('highlight-pulse');
          this.bookingService.focusedBookingId.set(null);
        }, 1500);
      }, 0);
      onCleanup(() => { clearTimeout(scroll); clearTimeout(clearHighlight); element?.classList.remove('highlight-pulse'); });
    }, { allowSignalWrites: true });
  }

  setDate(date: string): void {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`))
      && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date) this.selectedDate.set(date);
  }
  setView(view: 'day' | 'week'): void { this.viewMode.set(view); }
  navigatePeriod(direction: -1 | 1): void {
    this.selectedDate.set(this.addDays(this.selectedDate(), direction * (this.viewMode() === 'week' ? 7 : 1)));
  }
  goToday(): void { this.selectedDate.set(vnDate()); }
  openDay(date: string): void { this.setDate(date); this.setView('day'); }
  private addDays(date: string, days: number): string {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }
  private formatDate(date: string, options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }): string {
    return new Intl.DateTimeFormat('vi-VN', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  }

  // Helper method to format time from hours (e.g. 9.5 -> "09:30")
  formatTime(hours: number): string {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  // Get bookings for a specific staff member
  getBookingsForStaff(staffId: number) {
    return this.periodBookings().filter(booking => booking.staffId === staffId && booking.date === this.selectedDate());
  }
  getBookingsForDate(date: string): BookingEvent[] { return this.periodBookings().filter(booking => booking.date === date); }
  staffName(staffId: number): string { return this.staffs().find(staff => staff.id === staffId)?.name || 'Chưa phân công'; }

  // Calculate top position based on start time
  getTopPosition(startTime: number): number {
    return (startTime - this.startHour) * this.hourHeight;
  }

  // Calculate height based on duration
  getHeight(duration: number): number {
    return duration * this.hourHeight;
  }

  startBooking(id: number) { void this.bookingService.startBooking(id); }
  walkInSaved(booking: BookingItem): void {
    this.openDay(booking.scheduledAt.slice(0, 10));
    this.bookingService.addCreatedBooking(booking);
    this.isSidebarOpen = false;
    this.message.set('Đã thêm khách vãng lai vào lịch hẹn. Bạn có thể xác nhận và bắt đầu phục vụ.');
    void this.bookingService.loadSalonBookings();
  }
  completeBooking(id: number) { void this.bookingService.completeBooking(id); }

  acceptBooking(id: number) {
    this.bookingService.acceptBooking(id);
  }

  rejectBooking(id: number) {
    this.bookingService.rejectBooking(id);
  }

  formatHour(hour: number): string {
    if (hour === 12) return '12 TRƯA';
    if (hour > 12) return `${hour - 12} CHIỀU`;
    return `${hour} SÁNG`;
  }
}
