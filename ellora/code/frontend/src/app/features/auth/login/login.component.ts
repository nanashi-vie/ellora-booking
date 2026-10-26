import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { ReactiveFormsModule, Validators, NonNullableFormBuilder } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LoginRequest } from '../../../models/auth.model';
import { AuthService } from '../../../services/auth.service';
import { ProfileApiService } from '../../../services/profile-api.service';
import { roleHome } from '../../../guards/role.guard';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly profileApiService = inject(ProfileApiService);
  private readonly router = inject(Router);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);

  loginForm = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    remember: [false],
  });

  confirmationForm = this.formBuilder.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  submitted = false;
  confirmationSubmitted = false;
  showPassword = false;
  isLoading = false;
  isResending = false;
  resendCooldown = 0;
  showAlert = false;
  isSuccess = false;
  requiresConfirmation = false;
  alertMessage = '';
  resendMessage = '';

  async ngOnInit(): Promise<void> {
    if (!this.isOAuthCallback()) {
      return;
    }

    this.isLoading = true;
    try {
      const authenticated = await this.waitForOAuthSession();
      if (!authenticated) {
        this.showAlert = true;
        this.alertMessage = 'Không thể hoàn tất đăng nhập Google. Vui lòng thử lại.';
        return;
      }

      const profile = await this.profileApiService.syncCurrentUser();
      this.isSuccess = true;
      await this.router.navigateByUrl(this.postLoginDestination(profile.role));
    } catch {
      this.showAlert = true;
      this.alertMessage = 'Đã đăng nhập Google nhưng không kết nối được backend.';
    } finally {
      this.isLoading = false;
      this.changeDetectorRef.detectChanges();
    }
  }

  get emailInvalid(): boolean {
    const control = this.loginForm.controls.email;
    return control.invalid && (control.touched || this.submitted);
  }

  get passwordInvalid(): boolean {
    const control = this.loginForm.controls.password;
    return control.invalid && (control.touched || this.submitted);
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  get confirmationCodeInvalid(): boolean {
    const control = this.confirmationForm.controls.code;
    return control.invalid && (control.touched || this.confirmationSubmitted);
  }

  async loginWithGoogle(): Promise<void> {
    this.showAlert = false;
    this.alertMessage = '';
    const result = await this.authService.loginWithGoogle();

    if (!result.success) {
      this.showAlert = true;
      this.alertMessage = result.message ?? 'Không thể đăng nhập bằng Google.';
      this.changeDetectorRef.detectChanges();
    }
  }

  async login(): Promise<void> {
    this.submitted = true;
    this.showAlert = false;
    this.isSuccess = false;
    this.alertMessage = '';

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    try {
      const result = await this.authService.login(
        this.loginForm.getRawValue() as LoginRequest,
      );

      if (result.success) {
        await this.completeLogin();
        return;
      }

      if (result.requiresConfirmation) {
        this.requiresConfirmation = true;
        this.showAlert = false;
        this.alertMessage = '';
        await this.sendConfirmationCode();
        return;
      }

      this.showAlert = true;
      this.alertMessage = result.message ?? 'Thông tin đăng nhập không hợp lệ.';
    } catch {
      this.showAlert = true;
      this.alertMessage = 'Đã đăng nhập Cognito nhưng không kết nối được backend. Hãy bật backend rồi thử lại.';
    } finally {
      this.isLoading = false;
      this.changeDetectorRef.detectChanges();
    }
  }

  async confirmRegistration(): Promise<void> {
    this.confirmationSubmitted = true;
    this.showAlert = false;
    this.alertMessage = '';

    if (this.confirmationForm.invalid) {
      this.confirmationForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    try {
      const confirmation = await this.authService.confirmRegistration(
        this.loginForm.controls.email.value,
        this.confirmationForm.controls.code.value,
      );

      if (!confirmation.success) {
        this.showAlert = true;
        this.alertMessage = confirmation.message ?? 'Không thể xác nhận email.';
        return;
      }

      const loginResult = await this.authService.login(
        this.loginForm.getRawValue() as LoginRequest,
      );

      if (!loginResult.success) {
        this.requiresConfirmation = false;
        this.showAlert = true;
        this.alertMessage = 'Email đã xác nhận. Vui lòng đăng nhập lại.';
        return;
      }

      await this.completeLogin();
    } catch {
      this.showAlert = true;
      this.alertMessage = 'Email đã xác nhận nhưng chưa thể kết nối backend. Vui lòng đăng nhập lại.';
    } finally {
      this.isLoading = false;
      this.changeDetectorRef.detectChanges();
    }
  }

  async resendConfirmationCode(): Promise<void> {
    if (this.isResending || this.resendCooldown > 0) {
      return;
    }

    await this.sendConfirmationCode();
  }

  private async sendConfirmationCode(): Promise<void> {
    this.resendMessage = '';
    this.showAlert = false;
    this.isResending = true;
    try {
      const result = await this.authService.resendConfirmationCode(
        this.loginForm.controls.email.value,
      );

      if (result.success) {
        this.resendMessage = result.message ?? 'Đã gửi lại mã xác nhận.';
        this.startResendCooldown();
        return;
      }

      this.showAlert = true;
      this.alertMessage = result.message ?? 'Không thể gửi lại mã xác nhận.';
    } finally {
      this.isResending = false;
      this.changeDetectorRef.detectChanges();
    }
  }

  backToLogin(): void {
    this.requiresConfirmation = false;
    this.confirmationSubmitted = false;
    this.confirmationForm.reset();
    this.resendMessage = '';
    this.showAlert = false;
    this.alertMessage = '';
  }

  private async completeLogin(): Promise<void> {
    const profile = await this.profileApiService.syncCurrentUser();
    this.isSuccess = true;
    await this.router.navigateByUrl(this.postLoginDestination(profile.role));
  }

  private postLoginDestination(role: 'ADMIN' | 'SALON_OWNER' | 'CUSTOMER'): string {
    if (role !== 'CUSTOMER') return roleHome(role);
    const requested = this.router.parseUrl(this.router.url).queryParams['returnUrl'];
    if (typeof requested === 'string' && requested.startsWith('/booking?')) return requested;
    try {
      const pending = JSON.parse(window.sessionStorage.getItem('ellora.pendingBooking') ?? 'null') as { salonId?: unknown; serviceId?: unknown; createdAt?: unknown } | null;
      if (pending && typeof pending.salonId === 'string' && typeof pending.serviceId === 'string' &&
          typeof pending.createdAt === 'number' && Date.now() - pending.createdAt <= 30 * 60 * 1000) {
        return `/booking?salonId=${encodeURIComponent(pending.salonId)}&serviceId=${encodeURIComponent(pending.serviceId)}&resume=1`;
      }
      window.sessionStorage.removeItem('ellora.pendingBooking');
    } catch { /* No pending booking; continue to the normal customer landing page. */ }
    return roleHome(role);
  }

  private startResendCooldown(): void {
    this.resendCooldown = 30;
    const timer = setInterval(() => {
      this.resendCooldown -= 1;
      this.changeDetectorRef.detectChanges();

      if (this.resendCooldown <= 0) {
        clearInterval(timer);
      }
    }, 1000);
  }

  private isOAuthCallback(): boolean {
    return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('code');
  }

  private async waitForOAuthSession(): Promise<boolean> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (await this.authService.isAuthenticated()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  }
}
