import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-admin-navigation',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav aria-label="Điều hướng quản trị">
      <a routerLink="/admin/dashboard" routerLinkActive="is-active" ariaCurrentWhenActive="page" [routerLinkActiveOptions]="{ exact: true }">Tổng quan</a>
      <a routerLink="/admin/users" routerLinkActive="is-active" ariaCurrentWhenActive="page">Người dùng</a>
      <a routerLink="/admin/approvals" routerLinkActive="is-active" ariaCurrentWhenActive="page">Duyệt đăng ký</a>
      <a routerLink="/admin/salon-changes" routerLinkActive="is-active" ariaCurrentWhenActive="page">Duyệt cập nhật</a>
      <a routerLink="/admin/content" routerLinkActive="is-active" ariaCurrentWhenActive="page">Nội dung</a>
      <a routerLink="/admin/billing" routerLinkActive="is-active" ariaCurrentWhenActive="page">Phí nền tảng</a>
      <a routerLink="/admin/booking-disputes" routerLinkActive="is-active" ariaCurrentWhenActive="page">Phản ánh lịch hẹn</a>
    </nav>
  `,
  styles: [`
    :host { display: block; min-width: 0; margin-bottom: 24px; }
    nav { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: thin; padding: 2px 2px 14px; border-bottom: 1px solid #eadfe3; }
    a { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; min-height: 42px; padding: 9px 16px; border: 1px solid #e3d5dc; border-radius: 8px; background: white; color: #66535d; font-size: 14px; font-weight: 600; line-height: 1.4; white-space: nowrap; text-decoration: none; }
    a:hover { border-color: #8c3a5a; background: #fdf0f5; }
    a.is-active { border-color: #8c3a5a; background: #8c3a5a; color: white; }
    a:focus-visible { outline: 2px solid #8c3a5a; outline-offset: 2px; }
  `],
})
export class AdminNavigationComponent {}
