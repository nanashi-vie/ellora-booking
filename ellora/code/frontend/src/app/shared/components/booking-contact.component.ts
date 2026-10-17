import { Component, inject, input, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Clipboard } from '@angular/cdk/clipboard';
import { BookingEvent } from '../../services/booking.service';

@Component({
  selector: 'app-booking-contact', standalone: true,
  host: { '[class.compact]': 'compact()' },
  template: `
    <div class="contact-row">
      <span class="phone-number">SĐT: {{ phone() || 'Chưa có số điện thoại' }}</span>
      <button type="button" (click)="$event.stopPropagation(); copyPhone()" [disabled]="!phone()"
        [attr.aria-label]="'Sao chép số điện thoại của ' + booking().customerName" title="Sao chép SĐT">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>
        <span class="button-label">Sao chép SĐT</span>
      </button>
      <button type="button" (click)="$event.stopPropagation(); copyAppointment()"
        [attr.aria-label]="'Sao chép thông tin lịch hẹn của ' + booking().customerName" title="Sao chép khách hàng, SĐT, dịch vụ và thời gian">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5V3h6v2M9 10h6M9 14h6M9 18h4"/></svg>
        <span class="button-label">Sao chép lịch</span>
      </button>
    </div>
    <p role="status" aria-live="polite" class="copy-feedback" [class.copy-error]="copyFailed()">{{ feedback() }}</p>
  `,
  styles: [`
    :host { display: block; margin-top: 8px; }
    .contact-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .phone-number { width: 100%; color: #665860; font-size: 12px; overflow-wrap: anywhere; }
    button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: 1px solid #eadfe3; background: #fdf7f9; color: #8c3a5a; border-radius: 6px; padding: 5px 8px; font: inherit; font-size: 11px; cursor: pointer; }
    button:hover:enabled { background: #fbe9ef; }
    button:focus-visible { outline: 2px solid #8c3a5a; outline-offset: 2px; }
    button:disabled { opacity: .45; cursor: not-allowed; }
    svg { width: 14px; height: 14px; flex-shrink: 0; }
    .copy-feedback { font-size: 11px; color: #21643c; margin: 4px 0 0; }
    .copy-feedback:empty { display: none; }
    .copy-error { color: #a12238; }
    :host(.compact) { margin-top: 4px; }
    :host(.compact) .contact-row { flex-wrap: nowrap; }
    :host(.compact) .phone-number { flex: 1; width: auto; min-width: 0; font-size: 11px; }
    :host(.compact) button { padding: 4px; flex-shrink: 0; }
    :host(.compact) .button-label { display: none; }
  `]
})
export class BookingContactComponent {
  readonly booking = input.required<BookingEvent>();
  readonly compact = input(false);
  readonly feedback = signal('');
  readonly copyFailed = signal(false);
  private readonly clipboard = inject(Clipboard);
  private readonly platformId = inject(PLATFORM_ID);

  phone(): string { return this.booking().customerPhone?.trim() || ''; }
  copyPhone(): void {
    if (this.phone()) this.copy(this.phone(), 'Đã sao chép SĐT.');
  }
  copyAppointment(): void {
    const booking = this.booking();
    const [year, month, day] = booking.date.split('-');
    const minutes = Math.round(booking.startTime * 60);
    const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    this.copy([
      `Lịch hẹn #${booking.id}`,
      `Khách hàng: ${booking.customerName}`,
      `SĐT: ${this.phone() || 'Chưa có số điện thoại'}`,
      `Dịch vụ: ${booking.serviceName}`,
      `Thời gian: ${time} ngày ${day}/${month}/${year} (giờ Việt Nam)`
    ].join('\n'), 'Đã sao chép thông tin lịch hẹn.');
  }
  private copy(text: string, success: string): void {
    let copied = false;
    try { copied = isPlatformBrowser(this.platformId) && this.clipboard.copy(text); } catch { /* Show a useful failure below. */ }
    this.copyFailed.set(!copied);
    this.feedback.set(copied ? success : 'Không sao chép được. Vui lòng thử lại hoặc sao chép thủ công.');
  }
}
