import { Component, ElementRef, HostListener, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { BookingService } from '../../services/booking.service';
import { BookingContactComponent } from '../../shared/components/booking-contact.component';
import { SupportContact, SupportContactApiService } from '../../services/support-contact-api.service';
import { ownerError } from '../../services/owner-api.service';
@Component({
  selector: 'app-owner-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, BookingContactComponent],
  templateUrl: './owner-layout.html',
  styleUrl: './owner-layout.css',
})
export class OwnerLayout implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);
  private readonly bookingService = inject(BookingService);
  private readonly supportApi = inject(SupportContactApiService);

  userName = '';
  userInitial = '';
  isDropdownOpen = false;
  isNotificationOpen = false;
  readonly isSupportOpen = signal(false);
  readonly supportLoading = signal(false);
  readonly supportError = signal('');
  readonly supportContact = signal<SupportContact | null>(null);

  soundEnabled = this.bookingService.soundEnabled;
  ringing = this.bookingService.ringing;
  soundError = this.bookingService.soundError;
  enableSound(): void { void this.bookingService.enableSound(); }
  stopRinging(): void { this.bookingService.stopRinging(); }
  ngOnDestroy(): void { this.bookingService.stop(); }
  pendingCount = this.bookingService.pendingCount;
  pendingBookings = this.bookingService.pendingBookings;
  readonly salonName = this.bookingService.salonName;
  readonly salonLoadError = this.bookingService.error;

  async ngOnInit(): Promise<void> {
    this.bookingService.start();
    try {
      const profile = await this.authService.getUserProfile();
      this.userName = profile.name || profile.email;
      this.userInitial = this.userName.charAt(0).toUpperCase();
    } catch {
      this.userName = 'Owner';
      this.userInitial = 'O';
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    
    if (this.isDropdownOpen && !this.elementRef.nativeElement.querySelector('.user-dropdown-container')?.contains(target)) {
      this.isDropdownOpen = false;
    }
    
    if (this.isNotificationOpen && !this.elementRef.nativeElement.querySelector('.notification-container')?.contains(target)) {
      this.isNotificationOpen = false;
    }
  }

  toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;
    if (this.isDropdownOpen) {
      this.isNotificationOpen = false;
    }
  }

  toggleNotification(): void {
    this.isNotificationOpen = !this.isNotificationOpen;
    if (this.isNotificationOpen) {
      this.isDropdownOpen = false;
    }
  }

  addBooking(): void {
    this.isDropdownOpen = false;
    this.isNotificationOpen = false;
    void this.router.navigate(['/owner/bookings'], { queryParams: { newBooking: 'walk-in' } });
  }

  async openSupport(): Promise<void> {
    this.isSupportOpen.set(true);
    this.supportLoading.set(true);
    this.supportError.set('');
    try { this.supportContact.set(await this.supportApi.get()); }
    catch (error) { this.supportError.set(ownerError(error)); }
    finally { this.supportLoading.set(false); }
  }

  closeSupport(): void { this.isSupportOpen.set(false); }

  @HostListener('document:keydown.escape')
  closeSupportOnEscape(): void { this.closeSupport(); }

  focusBooking(id: number): void {
    this.bookingService.focusedBookingId.set(id);
    this.isNotificationOpen = false;
    this.router.navigate(['/owner/bookings']);
  }

  formatTime(hours: number): string {
    const hour = Math.floor(hours);
    const minute = Math.round((hours - hour) * 60);
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  async logout(): Promise<void> {
    this.isDropdownOpen = false;
    await this.authService.logout();
    await this.router.navigateByUrl('/login');
  }
}
