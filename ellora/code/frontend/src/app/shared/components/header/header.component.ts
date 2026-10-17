import { Component, ElementRef, HostBinding, HostListener, inject, OnInit, OnDestroy, PLATFORM_ID, ChangeDetectorRef, NgZone } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
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
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);
  readonly search = inject(PublicSalonSearchService);
  private destroyed = false;

  private readonly handleScroll = () => {
    const atTop = window.scrollY <= 20;
    if (this.isAtTop !== atTop) this.zone.run(() => { this.isAtTop = atTop; });
  };
  isAtTop = true;

  isAuthChecking = true;
  isLoggedIn = false;
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
      this.isSearchActive = false; this.isMobileMenuOpen = false; this.isDropdownOpen = false;
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
    if (isPlatformBrowser(this.platformId)) window.removeEventListener('scroll', this.handleScroll);
    clearTimeout(this.comingSoonTimer);
  }

  get isHomePage(): boolean {
    return this.router.url === '/';
  }

  get isBookingPage(): boolean {
    return this.router.url.startsWith('/booking');
  }

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
  }

  toggleSearch(active?: boolean): void {
    this.isSearchActive = active ?? !this.isSearchActive;
    if (this.isSearchActive) { this.isDropdownOpen = false; this.isMobileMenuOpen = false; }
    this.cdr.detectChanges();
  }

  @HostListener('document:keydown.escape', ['$event'])
  closeSearchOnEscape(event: Event): void {
    if (!this.isSearchActive) return;
    event.preventDefault(); this.toggleSearch(false);
  }

  toggleMobileMenu(): void {
    this.isSearchActive = false;
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  navigateTo(route: string): void {
    this.isDropdownOpen = false;
    this.isMobileMenuOpen = false;
    this.isSearchActive = false;
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
    this.isDropdownOpen = false;
    this.isMobileMenuOpen = false;
    await this.authService.logout();
    this.isLoggedIn = false;
    this.userName = '';
    this.userInitial = '';
    await this.router.navigateByUrl('/login');
  }

  private async checkAuthState(): Promise<void> {
    try {
      this.isLoggedIn = await this.authService.isAuthenticated();
      if (this.isLoggedIn) {
        try {
          const profile = await this.authService.getUserProfile();
          this.userName = profile.name || profile.email;
          this.userInitial = this.userName.charAt(0).toUpperCase();
        } catch {
          this.userName = 'User';
          this.userInitial = 'U';
        }
      }
    } finally {
      this.isAuthChecking = false;
      if (!this.destroyed) this.cdr.detectChanges();
    }
  }
}
