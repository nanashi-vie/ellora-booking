import { Component, inject, OnInit, signal } from '@angular/core';
import { PendingPage, SalonRegistration, SalonRegistrationService } from '../../services/salon-registration.service';

@Component({ standalone: true, styleUrl: '../admin-content/admin-page.scss', template: `
  <section class="admin-page">
    <header class="admin-page-header">
      <div><h1>Duyệt đăng ký salon</h1><p>Kiểm tra hồ sơ đăng ký và cấp quyền quản lý tiệm.</p></div>
      <button type="button" (click)="load()" [disabled]="busy()">Tải lại danh sách</button>
    </header>
    @if (error()) { <p role="alert" class="text-red-700 mb-4">{{ error() }}</p> }
    @if (message()) { <p role="status" class="text-green-800 mb-4">{{ message() }}</p> }
    @if (busy()) { <p role="status">Đang xử lý…</p> }
    @for (salon of page()?.content; track salon.id) {
      <article class="card flex flex-wrap items-start justify-between gap-4">
        <div><h2>{{ salon.name }}</h2><p>{{ salon.address }}, {{ salon.city }}</p></div>
        <button type="button" (click)="detail(salon.id)" [disabled]="busy()">Xem hồ sơ</button>
      </article>
    } @empty { @if (!busy() && page()) { <p>Không có đăng ký chờ duyệt.</p> } }
    <div class="pager">
      <button type="button" [disabled]="busy() || pageNumber() === 0" (click)="move(-1)" class="disabled:opacity-40">Trang trước</button>
      <span>Trang {{ pageNumber() + 1 }}</span>
      <button type="button" [disabled]="busy() || !page() || page()?.last" (click)="move(1)" class="disabled:opacity-40">Trang sau</button>
    </div>
    @if (selected(); as salon) {
      <section class="card mt-8" aria-label="Hồ sơ đăng ký">
        <h2>{{ salon.name }}</h2>
        <p>Người đăng ký: {{ salon.ownerName }}</p>
        <p>Liên hệ: {{ salon.email || 'Chưa có email' }} · {{ salon.phone || 'Chưa có số điện thoại' }}</p>
        <p>Địa chỉ: {{ salon.address }}, {{ salon.district }}, {{ salon.city }}</p>
        <p class="my-4">{{ salon.description }}</p>
        <p class="text-sm mb-4">Duyệt sẽ kích hoạt salon và cấp quyền quản lý cho người đăng ký.</p>
        @if (salon.status === 'PENDING_APPROVAL') {
          <div class="actions">
            <button type="button" (click)="decide('approve')" [disabled]="busy()" class="primary">Duyệt đăng ký</button>
            <button type="button" (click)="decide('reject')" [disabled]="busy()" class="danger">Từ chối</button>
          </div>
        } @else { <p>Hồ sơ này đã được xử lý. Vui lòng tải lại danh sách.</p> }
      </section>
    }
  </section>` })
export class AdminApprovalsComponent implements OnInit {
  private readonly api = inject(SalonRegistrationService);
  readonly busy = signal(false); readonly error = signal(''); readonly message = signal('');
  readonly page = signal<PendingPage | null>(null); readonly pageNumber = signal(0);
  readonly selected = signal<SalonRegistration | null>(null);
  ngOnInit() { void this.load(); }
  async load() {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.selected.set(null);
    try { this.page.set(await this.api.pending(this.pageNumber())); }
    catch { this.page.set(null); this.error.set('Không tải được danh sách. Kiểm tra quyền admin hoặc thử lại.'); }
    finally { this.busy.set(false); }
  }
  async move(delta: number) { this.pageNumber.update(page => Math.max(0, page + delta)); await this.load(); }
  async detail(id: number) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.selected.set(null);
    try { this.selected.set(await this.api.detail(id)); }
    catch { this.error.set('Không tải được hồ sơ đăng ký.'); }
    finally { this.busy.set(false); }
  }
  async decide(action: 'approve' | 'reject') {
    const salon = this.selected();
    if (!salon || this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try {
      await this.api.decide(salon.id, action);
      this.selected.set(null); this.pageNumber.set(0);
      this.message.set(action === 'approve' ? 'Đã duyệt và cấp quyền chủ salon.' : 'Đã từ chối đăng ký.');
    } catch { this.error.set('Không xử lý được đăng ký. Hồ sơ có thể đã được admin khác xử lý; hãy tải lại.'); return; }
    finally { this.busy.set(false); }
    await this.load();
  }
}
