import { Component, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BookingApiService, BookingItem } from '../../../services/booking-api.service';
import { OwnerService, OwnerEmployee, ownerError } from '../../../services/owner-api.service';
import { vnDate } from '../../../services/billing-api.service';

@Component({
  selector: 'app-walk-in-form', standalone: true, imports: [ReactiveFormsModule], styleUrl: '../owner-data.scss',
  template: `
  <form [formGroup]="form" (ngSubmit)="save()" class="owner-page" style="padding:24px">
    <p class="muted">Khách không cần tài khoản Ellora. Chọn dịch vụ và giờ trong thời gian tiệm mở cửa.</p>
    @if (error()) { <p role="alert" class="error">{{ error() }}</p> }
    <fieldset [disabled]="saving()">
      <label>Tên khách (không bắt buộc)<input formControlName="customerName" maxlength="255" placeholder="Khách vãng lai" autocomplete="off"></label>
      <label>Số điện thoại (không bắt buộc)<input type="tel" formControlName="customerPhone" maxlength="20" autocomplete="off"></label>
      <label>Dịch vụ<select formControlName="serviceId" required><option value="">Chọn dịch vụ</option>
        @for (service of services(); track service.id) { <option [value]="service.id">{{ service.name }} · {{ service.durationMinutes }} phút · {{ service.price.toLocaleString('vi-VN') }} ₫</option> }
      </select></label>
      @if (!services().length) { <p class="muted">Tiệm cần có dịch vụ đang hoạt động để thêm lịch.</p> }
      <label>Nhân viên<select formControlName="employeeId"><option value="">Tự phân công nhân viên trống</option>
        @for (employee of employees(); track employee.id) { <option [value]="employee.id">{{ employee.fullName }}</option> }
      </select></label>
      <div class="grid">
        <label>Ngày<input type="date" formControlName="date" required></label>
        <label>Giờ bắt đầu<input type="time" formControlName="time" step="1800" required></label>
      </div>
      <label>Ghi chú<textarea formControlName="customerNote" maxlength="1000" rows="3"></textarea></label>
      <p class="muted">Lịch mới ở trạng thái chờ xác nhận. Tiệm có thể xác nhận và bắt đầu ngay trong danh sách lịch hẹn.</p>
      <button type="submit" class="primary" [disabled]="!services().length">{{ saving() ? 'Đang thêm…' : 'Thêm vào lịch hẹn' }}</button>
    </fieldset>
  </form>`
})
export class WalkInFormComponent {
  private readonly api = inject(BookingApiService);
  readonly services = input.required<OwnerService[]>();
  readonly employees = input.required<OwnerEmployee[]>();
  readonly saved = output<BookingItem>();
  readonly busy = output<boolean>();
  readonly saving = signal(false); readonly error = signal('');
  readonly form = inject(NonNullableFormBuilder).group({
    customerName: ['', Validators.maxLength(255)], customerPhone: ['', Validators.pattern(/^$|^[+0-9 ()-]{8,20}$/)],
    serviceId: ['', Validators.required], employeeId: '', date: [vnDate(), Validators.required],
    time: ['', [Validators.required, Validators.pattern(/^(?:[01]\d|2[0-3]):(?:00|30)$/)]],
    customerNote: ['', Validators.maxLength(1000)]
  });
  async save(): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    if (this.form.invalid || !this.services().some(service => service.id === Number(value.serviceId))
      || (value.employeeId && !this.employees().some(employee => employee.id === Number(value.employeeId)))) {
      this.error.set('Chọn dịch vụ, ngày và giờ theo mốc 30 phút. Kiểm tra số điện thoại nếu có nhập.'); return;
    }
    this.saving.set(true); this.error.set('');
    this.busy.emit(true);
    let created: BookingItem | undefined;
    try {
      created = await this.api.createWalkIn({
        serviceId: Number(value.serviceId), employeeId: value.employeeId ? Number(value.employeeId) : undefined,
        scheduledAt: value.date + 'T' + value.time + ':00', customerName: value.customerName.trim(),
        customerPhone: value.customerPhone.trim(), customerNote: value.customerNote.trim()
      });
    } catch (error) {
      this.error.set(error instanceof HttpErrorResponse && error.status === 400 && typeof error.error?.message === 'string'
        ? error.error.message : ownerError(error));
    } finally { this.saving.set(false); this.busy.emit(false); }
    if (created) this.saved.emit(created);
  }
}
