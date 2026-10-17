import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { nonOwnerGuard, roleGuard } from './guards/role.guard';

export const routes: Routes = [
  {
    path: 'admin',
    canActivate: [roleGuard],
    canActivateChild: [roleGuard],
    data: { role: 'ADMIN' },
    loadComponent: () => import('./layouts/admin-layout/admin-layout.component').then(m => m.AdminLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./features/admin-dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent) },
      { path: 'users', loadComponent: () => import('./features/admin-users/admin-users.component').then(m => m.AdminUsersComponent) },
      { path: 'content', loadComponent: () => import('./features/admin-content/admin-content.component').then(m => m.AdminContentComponent) },
      { path: 'billing', loadComponent: () => import('./features/admin-content/billing.component').then(m => m.AdminBillingComponent) },
      { path: 'approvals', loadComponent: () => import('./features/admin-approvals/admin-approvals.component').then(m => m.AdminApprovalsComponent) },
      { path: 'booking-disputes', loadComponent: () => import('./features/admin-booking-disputes/admin-booking-disputes.component').then(m => m.AdminBookingDisputesComponent) }
    ]
  },
  {
    path: '',
    canActivateChild: [nonOwnerGuard],
    loadComponent: () => import('./layouts/main-layout/main-layout.component').then(m => m.MainLayout),
    children: [
      {
        path: '',
        loadComponent: () => import('./features/home-page/home/home.component').then(m => m.Home)
      },
      {
        path: 'search',
        loadComponent: () => import('./features/search/search.component').then(m => m.Search)
      },
      {
        path: 'salon/:id',
        loadComponent: () => import('./features/salon-details/salon-details.component').then(m => m.SalonDetails)
      },
      {
        path: 'for-business',
        loadComponent: () => import('./features/home-page/for-business/for-business.component').then(m => m.ForBusiness)
      },
      {
        path: 'booking',
        data: { customerOnly: true },
        canActivate: [authGuard],
        loadComponent: () => import('./features/booking/booking.component').then(m => m.BookingComponent)
      },
      {
        path: 'setting',
        canActivate: [authGuard],
        loadComponent: () => import('./features/customer/setting-layout/setting-layout.component').then(m => m.SettingLayoutComponent),
        children: [
          {
            path: '',
            redirectTo: 'profile',
            pathMatch: 'full'
          },
          {
            path: 'profile',
            loadComponent: () => import('./features/customer/profile/profile.component').then(m => m.Profile)
          },
          {
            path: 'my-bookings',
            loadComponent: () => import('./features/customer/my-bookings/my-bookings.component').then(m => m.MyBookings)
          },
          {
            path: 'security',
            loadComponent: () => import('./features/customer/security/security.component').then(m => m.SecurityComponent)
          }
        ]
      },
      {
        path: 'business-registration',
        data: { customerOnly: true },
        canActivate: [authGuard],
        loadComponent: () => import('./features/business-registration/business-registration.component').then(m => m.BusinessRegistrationComponent)
      },
    ]
  },
  {
    path: 'owner',
    canActivate: [roleGuard],
    canActivateChild: [roleGuard],
    data: { role: 'SALON_OWNER' },
    loadComponent: () => import('./layouts/owner-layout/owner-layout').then(m => m.OwnerLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'profile',
        loadComponent: () => import('./features/owner/salon-profile/salon-profile.component').then(m => m.SalonProfileComponent)
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/owner/dashboard/dashboard.component').then(m => m.Dashboard)
      },
      {
        path: 'analytics',
        loadComponent: () => import('./features/owner/dashboard/analytics-page.component').then(m => m.OwnerAnalyticsPage)
      },
      {
        path: 'billing',
        loadComponent: () => import('./features/owner/dashboard/billing-page.component').then(m => m.OwnerBillingPage)
      },
      {
        path: 'services',
        loadComponent: () => import('./features/owner/service-management/service-management.component').then(m => m.ServiceManagement)
      },
      {
        path: 'staff',
        loadComponent: () => import('./features/owner/staff-management/staff-management.component').then(m => m.StaffManagement)
      },
      {
        path: 'reviews',
        loadComponent: () => import('./features/owner/review-management/review-management.component').then(m => m.ReviewManagement)
      },
      {
        path: 'bookings',
        loadComponent: () => import('./features/owner/booking-management/booking-management.component').then(m => m.BookingManagement)
      }
    ]
  },
  {
    path: 'login',
    canActivate: [nonOwnerGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    canActivate: [nonOwnerGuard],
    loadComponent: () =>
      import('./features/auth/register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'forgot-password',
    canActivate: [nonOwnerGuard],
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.component').then(
        (m) => m.ForgotPasswordComponent,
      ),
  },
  {
    path: '**',
    redirectTo: '/',
  },
];
