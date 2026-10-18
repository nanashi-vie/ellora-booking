import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupportContact, SupportContactApiService } from '../../services/support-contact-api.service';
import { ownerError } from '../../services/owner-api.service';

@Component({
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="admin-page">
      <header class="admin-page-header"><div><h1>Thông tin hỗ trợ</h1><p>Thông tin này sẽ hiển thị trong popup Hỗ trợ ở trang Owner.</p></div></header>
      @if (error()) { <p role="alert" class="error">{{ error() }}</p> }
      @if (message()) { <p role="status" class="success">{{ message() }}</p> }
      <form class="card" #contactForm="ngForm" (ngSubmit)="save()">
        <label>Email hỗ trợ<input type="email" name="email" [(ngModel)]="contact.email" maxlength="254" autocomplete="email" placeholder="support@example.com"></label>
        <label>Số điện thoại<input type="tel" name="phone" [(ngModel)]="contact.phone" maxlength="30" autocomplete="tel" placeholder="0901234567"></label>
        <label>Link Facebook<input type="url" name="facebookUrl" [(ngModel)]="contact.facebookUrl" maxlength="500" placeholder="https://facebook.com/..."></label>
        <div class="actions"><button class="primary" type="submit" [disabled]="busy() || !contactForm.valid">{{ busy() ? 'Đang lưu…' : 'Lưu thông tin hỗ trợ' }}</button></div>
      </form>
    </section>
  `,
  styleUrl: './admin-page.scss'
})
export class AdminSupportContactComponent implements OnInit {
  private readonly api = inject(SupportContactApiService);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  contact: SupportContact = { email: '', phone: '', facebookUrl: '' };

  async ngOnInit() {
    this.busy.set(true);
    try { this.contact = await this.api.get(); }
    catch (e) { this.error.set(ownerError(e)); }
    finally { this.busy.set(false); }
  }

  async save() {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { this.contact = await this.api.update(this.contact); this.message.set('Đã lưu thông tin hỗ trợ.'); }
    catch (e) { this.error.set(ownerError(e)); }
    finally { this.busy.set(false); }
  }
}
