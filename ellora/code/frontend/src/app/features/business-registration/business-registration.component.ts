import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SalonRegistration, SalonRegistrationService } from '../../services/salon-registration.service';

@Component({
  standalone: true, imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="max-w-3xl mx-auto px-6 py-12">
      <p class="text-dusty-pink-600 mb-3">DÀNH CHO CHỦ SALON</p>
      <h1 class="font-serif text-3xl mb-4">Đăng ký đối tác Ellora</h1>
      <p class="mb-8">Gửi thông tin salon để admin xét duyệt. Bạn vẫn sử dụng tài khoản khách hàng trong thời gian chờ.</p>
      @if (loading()) { <p role="status">Đang tải đăng ký…</p> }
      @if (error()) { <p role="alert" class="text-red-700 mb-4">{{ error() }}</p> }
      @if (registration(); as salon) {
        <section class="bg-white border rounded-xl p-6">
          <h2 class="text-xl font-semibold mb-3">{{ salon.name }}</h2>
          <p>{{ salon.address }}, {{ salon.district }}, {{ salon.city }}</p>
          <p class="mt-4" role="status">{{ statuses[salon.status] }}</p>
          @if (salon.status === 'ACTIVE') { <a routerLink="/owner/dashboard" class="inline-block mt-4 underline">Mở trang quản lý salon</a> }
          <button type="button" class="block mt-4 underline" (click)="load()" [disabled]="loading()">Kiểm tra trạng thái</button>
        </section>
      } @else if (!loading() && !loadFailed()) {
        <form [formGroup]="form" (ngSubmit)="submit()" class="bg-white border rounded-xl p-6 space-y-4">
          @for (field of fields; track field.key) {
            <div><label [for]="field.key" class="block mb-2">{{ field.label }}</label>
              <input [id]="field.key" [type]="field.type" [formControlName]="field.key" class="w-full border rounded px-3 py-2" [required]="field.required">
            </div>
          }
          <button type="submit" [disabled]="saving()" class="bg-primary hover:bg-primary-hover text-white px-6 py-3 rounded disabled:opacity-50">{{ saving() ? 'Đang gửi…' : 'Gửi đăng ký xét duyệt' }}</button>
        </form>
      }
      @if (loadFailed()) { <button type="button" (click)="load()" class="underline">Thử tải lại</button> }
    </main>`,
})
export class BusinessRegistrationComponent implements OnInit {
  private readonly api = inject(SalonRegistrationService);
  readonly loading = signal(true); readonly saving = signal(false); readonly error = signal('');
  readonly loadFailed = signal(false); readonly registration = signal<SalonRegistration | null>(null);
  readonly statuses = { PENDING_APPROVAL: 'Đang chờ admin duyệt.', ACTIVE: 'Đã duyệt. Bạn đã được cấp quyền chủ salon.', REJECTED: 'Đăng ký đã bị từ chối. Vui lòng liên hệ quản trị viên.', SUSPENDED: 'Salon đang bị tạm khóa.' };
  readonly fields = [
    { key: 'name', label: 'Tên salon *', type: 'text', required: true },
    { key: 'address', label: 'Địa chỉ *', type: 'text', required: true },
    { key: 'city', label: 'Tỉnh / Thành phố *', type: 'text', required: true },
    { key: 'district', label: 'Quận / Huyện *', type: 'text', required: true },
    { key: 'phone', label: 'Số điện thoại liên hệ *', type: 'tel', required: true },
    { key: 'email', label: 'Email liên hệ *', type: 'email', required: true },
    { key: 'description', label: 'Giới thiệu salon', type: 'text', required: false },
  ];
  readonly form = inject(NonNullableFormBuilder).group({
    name: ['', Validators.required], address: ['', Validators.required], city: ['', Validators.required], district: ['', Validators.required],
    phone: ['', Validators.required], email: ['', [Validators.required, Validators.email]], description: [''],
  });
  ngOnInit() { void this.load(); }
  async load() {
    this.loading.set(true); this.error.set(''); this.loadFailed.set(false);
    try { this.registration.set(await this.api.mine()); }
    catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) this.registration.set(null);
      else { this.loadFailed.set(true); this.error.set('Không tải được đăng ký. Vui lòng thử lại.'); }
    } finally { this.loading.set(false); }
  }
  async submit() {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) { this.error.set('Vui lòng điền đầy đủ thông tin và email hợp lệ.'); return; }
    this.saving.set(true); this.error.set('');
    try { this.registration.set(await this.api.register(this.form.getRawValue())); }
    catch { this.error.set('Không gửi được đăng ký. Hãy kiểm tra trạng thái tài khoản hoặc thử tải lại trang.'); }
    finally { this.saving.set(false); }
  }
}
