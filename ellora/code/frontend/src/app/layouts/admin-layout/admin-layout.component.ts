import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from '../../shared/components/header/header.component';
import { AdminNavigationComponent } from '../../features/admin-content/admin-navigation.component';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [Header, AdminNavigationComponent, RouterOutlet],
  template: `
    <div class="admin-layout">
      <app-header />
      <div class="admin-layout-frame">
        <app-admin-navigation />
        <main class="admin-layout-content" aria-label="Quản trị Ellora">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styleUrl: './admin-layout.component.scss'
})
export class AdminLayout {}
