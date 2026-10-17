import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { OwnerApiService, OwnerClosure, ownerError } from '../../../services/owner-api.service';
import { vnDate } from '../../../services/billing-api.service';

@Component({
  selector: 'app-working-hours', standalone: true, imports: [ReactiveFormsModule, DatePipe],
  styleUrls: ['../owner-data.scss', './working-hours.component.scss'],
  templateUrl: './working-hours.component.html'
})
export class WorkingHoursComponent implements OnInit {
  private readonly api = inject(OwnerApiService);
  private readonly fb = inject(NonNullableFormBuilder);
  readonly dayNames = ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'];
  readonly loading = signal(true); readonly loaded = signal(false); readonly saving = signal(false);
  readonly error = signal(''); readonly message = signal('');
  readonly closureLoading = signal(true); readonly closuresLoaded = signal(false); readonly closureSaving = signal(false);
  readonly closureError = signal(''); readonly closureMessage = signal(''); readonly closures = signal<OwnerClosure[]>([]);
  readonly selectedDate = signal('');
  readonly dateClosed = signal(false);
  readonly weeklyForm = this.fb.group({ openTime: '09:00', closeTime: '19:00', days: this.fb.array(
    ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map(dayOfWeek =>
      this.fb.group({ dayOfWeek, openTime: '09:00', closeTime: '19:00', closed: false }))
  ) });
  readonly closureForm = this.fb.group({ date: ['', Validators.required], reason: ['', Validators.maxLength(500)] });
  readonly calendarMonth = signal(vnDate().slice(0, 7));
  readonly calendarTitle = computed(() => new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(this.calendarMonth() + '-01T00:00:00Z')));
  readonly calendarDays = computed(() => {
    const [year, month] = this.calendarMonth().split('-').map(Number);
    const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const length = Math.ceil((offset + new Date(Date.UTC(year, month, 0)).getUTCDate()) / 7) * 7;
    return Array.from({ length }, (_, index) => {
      const day = new Date(Date.UTC(year, month - 1, index - offset + 1));
      return { date: day.toISOString().slice(0, 10), day: day.getUTCDate(), currentMonth: day.getUTCMonth() === month - 1 };
    });
  });
  changeMonth(amount: number): void {
    const date = new Date(this.calendarMonth() + '-01T00:00:00Z');
    date.setUTCMonth(date.getUTCMonth() + amount); this.calendarMonth.set(date.toISOString().slice(0, 7));
  }
  isPlannedClosure(date: string): boolean { return this.closures().some(row => row.date === date); }
  private weekdayIndex(date: string): number { return (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7; }
  selectedDayIndex(): number { return this.weekdayIndex(this.selectedDate()); }
  selectedDay() { return this.selectedDate() ? this.weeklyForm.controls.days.at(this.selectedDayIndex()) : null; }
  selectedClosure(): OwnerClosure | undefined { return this.closures().find(row => row.date === this.selectedDate()); }
  isWeeklyClosed(date: string): boolean { return this.weeklyForm.controls.days.at(this.weekdayIndex(date)).controls.closed.value; }
  selectClosureDate(date: string): void {
    if (date < this.minClosureDate() || this.saving() || this.closureSaving()) return;
    this.selectedDate.set(date);
    this.calendarMonth.set(date.slice(0, 7));
    this.dateClosed.set(this.isPlannedClosure(date));
    this.closureForm.patchValue({ date, reason: this.closures().find(row => row.date === date)?.reason || '' });
    this.closureError.set(''); this.closureMessage.set('');
  }
  minClosureDate(): string {
    const next = new Date(`${vnDate()}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().slice(0, 10);
  }
  ngOnInit(): void { void this.load(); void this.loadClosures(); }
  private failure(error: unknown): string {
    return error instanceof HttpErrorResponse && error.status === 400 && typeof error.error?.message === 'string'
      ? error.error.message : ownerError(error);
  }
  private validInterval(open: string, close: string): boolean {
    return /^\d{2}:(00|30)$/.test(open) && /^\d{2}:(00|30)$/.test(close) && open < close && close < '24:00';
  }
  async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const hours = await this.api.workingHours();
      for (const day of this.weeklyForm.controls.days.controls) {
        const saved = hours.find(row => row.dayOfWeek === day.controls.dayOfWeek.value);
        if (!saved) throw new Error('Missing weekday');
        day.patchValue({ openTime: saved.openTime?.slice(0, 5) || '09:00', closeTime: saved.closeTime?.slice(0, 5) || '19:00', closed: saved.closed });
      }
      this.loaded.set(true);
    } catch (error) { this.loaded.set(false); this.error.set(this.failure(error)); }
    finally { this.loading.set(false); }
  }
  applyAll(): void {
    if (this.saving() || this.closureSaving()) return;
    const { openTime, closeTime } = this.weeklyForm.getRawValue();
    if (!this.validInterval(openTime, closeTime)) { this.error.set('Chọn giờ mở trước giờ đóng, theo mốc 30 phút.'); return; }
    this.weeklyForm.controls.days.controls.forEach(day => day.patchValue({ openTime, closeTime, closed: false }));
    this.error.set(''); this.message.set('Đã áp dụng giờ cho cả tuần. Bạn có thể chỉnh riêng ngày nghỉ rồi bấm Lưu giờ cả tuần.');
  }
  async saveHours(): Promise<void> {
    if (this.saving() || this.closureSaving() || !this.loaded()) return;
    const days = this.weeklyForm.getRawValue().days;
    if (days.some(day => !day.closed && !this.validInterval(day.openTime, day.closeTime))) {
      this.error.set('Kiểm tra giờ mở và đóng của các ngày làm việc, theo mốc 30 phút.'); return;
    }
    this.saving.set(true); this.error.set(''); this.message.set('');
    try {
      await this.api.saveWorkingHours(days.map(day => ({ ...day, openTime: day.closed ? null : day.openTime, closeTime: day.closed ? null : day.closeTime })));
      this.message.set('Đã lưu giờ mở cửa và xử lý các lịch bị ảnh hưởng bởi ngày đóng cửa.');
    } catch (error) { this.error.set(this.failure(error)); }
    finally { this.saving.set(false); }
  }
  async loadClosures(): Promise<void> {
    this.closureLoading.set(true); this.closureError.set('');
    try {
      this.closures.set(await this.api.closures()); this.closuresLoaded.set(true);
      if (!this.selectedDate()) this.selectClosureDate(this.minClosureDate());
    }
    catch (error) { this.closuresLoaded.set(false); this.closureError.set(this.failure(error)); }
    finally { this.closureLoading.set(false); }
  }
  async addClosure(): Promise<void> {
    if (this.closureSaving() || this.saving()) return;
    this.closureForm.markAllAsTouched();
    const { date, reason } = this.closureForm.getRawValue();
    if (this.closureForm.invalid || date < this.minClosureDate()) {
      this.closureError.set('Chọn ngày nghỉ từ ngày mai trở đi.'); return;
    }
    this.closureSaving.set(true); this.closureError.set(''); this.closureMessage.set('');
    try {
      const saved = await this.api.closeDate(date, reason.trim());
      this.closures.update(rows => [...rows.filter(row => row.id !== saved.id), saved].sort((a, b) => a.date.localeCompare(b.date)));
      this.dateClosed.set(true);
      this.closureForm.patchValue({ date: saved.date, reason: saved.reason });
      this.closureMessage.set('Đã lưu ngày nghỉ. Các lịch bị ảnh hưởng đã được từ chối/hủy.');
    } catch (error) { this.closureError.set(this.failure(error)); }
    finally { this.closureSaving.set(false); }
  }
  async removeClosure(closure: OwnerClosure): Promise<void> {
    if (this.closureSaving() || this.saving()) return;
    this.closureSaving.set(true); this.closureError.set(''); this.closureMessage.set('');
    try {
      await this.api.reopenDate(closure.id); this.closures.update(rows => rows.filter(row => row.id !== closure.id));
      if (this.selectedDate() === closure.date) { this.dateClosed.set(false); this.closureForm.controls.reason.setValue(''); }
      this.closureMessage.set('Đã bỏ ngày nghỉ riêng và dùng lại lịch theo thứ. Các lịch đã hủy không tự khôi phục.');
    } catch (error) { this.closureError.set(this.failure(error)); }
    finally { this.closureSaving.set(false); }
  }
  async saveSelectedClosure(): Promise<void> {
    if (this.dateClosed()) await this.addClosure();
    else {
      const closure = this.selectedClosure();
      if (closure) await this.removeClosure(closure);
    }
  }
}
