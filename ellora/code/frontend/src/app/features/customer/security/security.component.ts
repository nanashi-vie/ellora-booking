import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-security',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div>
      <div class="flex justify-between items-center mb-6">
        <h2 class="font-serif text-2xl text-charcoal-900">Bảo mật tài khoản</h2>
      </div>
      
      <form [formGroup]="form" (ngSubmit)="changePassword()" class="bg-white rounded-2xl shadow-sm border border-charcoal-800/5 p-8 max-w-xl space-y-5">
        <div><label for="currentPassword" class="block mb-2">Mật khẩu hiện tại</label><input id="currentPassword" type="password" autocomplete="current-password" formControlName="currentPassword" class="w-full border rounded-lg p-3" /></div>
        <div><label for="newPassword" class="block mb-2">Mật khẩu mới</label><input id="newPassword" type="password" autocomplete="new-password" formControlName="newPassword" class="w-full border rounded-lg p-3" /></div>
        <div><label for="confirmPassword" class="block mb-2">Xác nhận mật khẩu mới</label><input id="confirmPassword" type="password" autocomplete="new-password" formControlName="confirmPassword" class="w-full border rounded-lg p-3" /></div>
        @if (message()) { <p role="status" [class.text-red-700]="error()">{{ message() }}</p> }
        <button type="submit" [disabled]="saving()" class="bg-primary hover:bg-primary-hover text-white px-5 py-3 rounded-lg disabled:opacity-50">{{ saving() ? 'Đang lưu…' : 'Đổi mật khẩu' }}</button>
      </form>
    </div>
  `
})
export class SecurityComponent {
  private readonly auth = inject(AuthService);
  readonly form = inject(NonNullableFormBuilder).group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8), Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/)]],
    confirmPassword: ['', Validators.required],
  });
  readonly saving = signal(false);
  readonly error = signal(false);
  readonly message = signal('');

  async changePassword(): Promise<void> {
    this.form.markAllAsTouched();
    const { currentPassword, newPassword, confirmPassword } = this.form.getRawValue();
    if (this.form.invalid || newPassword !== confirmPassword) {
      this.error.set(true); this.message.set('Kiểm tra lại mật khẩu mới và xác nhận.'); return;
    }
    this.saving.set(true); this.message.set('');
    try {
      const result = await this.auth.changePassword(currentPassword, newPassword);
      this.error.set(!result.success);
      this.message.set(result.message ?? (result.success ? 'Đổi mật khẩu thành công.' : 'Không đổi được mật khẩu.'));
      if (result.success) this.form.reset();
    } finally { this.saving.set(false); }
  }
}
