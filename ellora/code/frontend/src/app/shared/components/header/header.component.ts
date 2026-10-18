import { Component, ElementRef, HostBinding, HostListener, inject, OnInit, OnDestroy, PLATFORM_ID, ChangeDetectorRef, NgZone } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { Profile, ProfileApiService } from '../../../services/profile-api.service';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SalonSearchFormComponent } from '../salon-search-form/salon-search-form.component';
import { PublicSalonSearchService } from '../../../services/public-salon-search.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, CdkTrapFocus, SalonSearchFormComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class Header implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly profileApi = inject(ProfileApiService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);
  readonly search = inject(PublicSalonSearchService);
  private destroyed = false;
  private authRequest = 0;

  private readonly handleScroll = () => {
    const atTop = window.scrollY <= 20;
    if (this.isAtTop !== atTop) this.zone.run(() => { this.isAtTop = atTop; });
  };
  isAtTop = true;

  isAuthChecking = true;
  isLoggedIn = false;
  userRole: Profile['role'] | null = null;
  userName = '';
  userInitial = '';
  isDropdownOpen = false;
  isMobileMenuOpen = false;
  isSearchActive = false;

  showComingSoon = false;
  private comingSoonTimer: ReturnType<typeof setTimeout> | undefined;

  @HostBinding('class.header-hidden')
  isHidden = false;

  constructor() {
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => {
      this.closeNavigation();
    });
  }

  get searchSummary(): string {
    const value = this.search.filters();
    return [value.keyword || 'Tiệm, dịch vụ', value.nearby ? 'Gần bạn' : value.location || 'Khu vực', value.date ? value.date.split('-').reverse().join('/') + (value.time ? ' ' + value.time : '') : 'Ngày, giờ'].join(' · ');
  }

  async ngOnInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      this.isAuthChecking = false;
      return;
    }
    this.zone.runOutsideAngular(() => window.addEventListener('scroll', this.handleScroll, { passive: true }));
    await this.checkAuthState();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.authRequest++;
    if (isPlatformBrowser(this.platformId)) window.removeEventListener('scroll', this.handleScroll);
    clearTimeout(this.comingSoonTimer);
  }

  get isHomePage(): boolean {
    return this.router.url === '/';
  }

  get isBookingPage(): boolean {
    return this.router.url.startsWith('/booking');
  }

  get isAdmin(): boolean { return this.isLoggedIn && this.userRole === 'ADMIN'; }
  get isCustomer(): boolean { return this.isLoggedIn && this.userRole === 'CUSTOMER'; }
  get logoLink(): string { return this.isAdmin ? '/admin/dashboard' : '/'; }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isDropdownOpen && !this.isMobileMenuOpen && !this.isSearchActive) {
      return;
    }
    const target = event.target as HTMLElement;
    if (!this.elementRef.nativeElement.contains(target)) {
      this.isDropdownOpen = false;
      this.isMobileMenuOpen = false;
      this.isSearchActive = false;
    }
  }

  toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;
    if (this.isDropdownOpen) { this.isSearchActive = false; this.isMobileMenuOpen = false; }
  }

  toggleSearch(active?: boolean): void {
    this.isSearchActive = active ?? !this.isSearchActive;
    if (this.isSearchActive) { this.isDropdownOpen = false; this.isMobileMenuOpen = false; }
    this.cdr.detectChanges();
  }

  @HostListener('document:keydown.escape', ['$event'])
  closeSearchOnEscape(event: Event): void {
    if (this.isSearchActive) {
      event.preventDefault(); this.toggleSearch(false);
      this.elementRef.nativeElement.querySelector('.header-search-trigger')?.focus();
    } else if (this.isDropdownOpen || this.isMobileMenuOpen) {
      event.preventDefault();
      const selector = this.isDropdownOpen ? '#header-avatar-btn' : '#mobile-menu-btn';
      this.closeNavigation();
      this.elementRef.nativeElement.querySelector(selector)?.focus();
    }
  }

  toggleMobileMenu(): void {
    this.isSearchActive = false;
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeNavigation(): void {
    this.isDropdownOpen = false;
    this.isMobileMenuOpen = false;
    this.isSearchActive = false;
    this.cdr.markForCheck();
  }

  navigateTo(route: string): void {
    this.closeNavigation();
    this.router.navigateByUrl(route);
  }

  showComingSoonToast(): void {
    this.isDropdownOpen = false;
    this.isMobileMenuOpen = false;
    this.showComingSoon = true;
    clearTimeout(this.comingSoonTimer);
    this.comingSoonTimer = setTimeout(() => {
      this.showComingSoon = false;
    }, 2000);
  }

  async logout(): Promise<void> {
    this.authRequest++;
    this.isDropdownOpen = false;
    this.isMobileMenuOpen = false;
    this.isSearchActive = false;
    this.isLoggedIn = false;
    this.isAuthChecking = false;
    this.userRole = null;
    this.userName = '';
    this.userInitial = '';
    await this.authService.logout();
    if (!this.destroyed) await this.router.navigateByUrl('/login');
  }

  private async checkAuthState(): Promise<void> {
    const request = ++this.authRequest;
    const current = () => !this.destroyed && request === this.authRequest;
    try {
      const authenticated = await this.authService.isAuthenticated();
      if (!current()) return;
      this.isLoggedIn = authenticated;
      if (authenticated) {
        try {
          const profile = await this.profileApi.getCurrentUser();
          if (!current()) return;
          this.userRole = ['ADMIN', 'CUSTOMER', 'SALON_OWNER'].includes(profile.role) ? profile.role : null;
          this.userName = profile.fullName?.trim() || profile.email?.trim() || 'Tài khoản';
          this.userInitial = this.userName.charAt(0).toUpperCase();
        } catch {
          if (!current()) return;
          this.userRole = null;
          this.userName = 'Tài khoản';
          this.userInitial = 'T';
        }
      }
    } catch {
      if (current()) { this.isLoggedIn = false; this.userRole = null; }
    } finally {
      if (current()) { this.isAuthChecking = false; this.cdr.markForCheck(); }
    }
  }
}
