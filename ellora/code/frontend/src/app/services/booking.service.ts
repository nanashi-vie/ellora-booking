import { isPlatformBrowser } from '@angular/common';
import { Injectable, computed, inject, signal, PLATFORM_ID, OnDestroy } from '@angular/core';
import { BookingApiService, BookingItem } from './booking-api.service';
import { OwnerApiService, ownerError } from './owner-api.service';

export interface BookingEvent {
  id: number;
  staffId: number;
  customerName: string;
  serviceName: string;
  date: string;
  startTime: number;
  duration: number;
  inProgress: boolean;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
}

@Injectable({ providedIn: 'root' })
export class BookingService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly api = inject(BookingApiService);
  private readonly owner = inject(OwnerApiService);
  bookings = signal<BookingEvent[]>([]);
  readonly salonName = signal('');
  focusedBookingId = signal<number | null>(null);
  pendingBookings = computed(() => this.bookings().filter(item => item.status === 'pending'));
  pendingCount = signal(0);
  error = signal('');
  isLoading = signal(false);
  readonly updatingBookings = signal<Set<number>>(new Set());

  private map(item: BookingItem): BookingEvent {
    const time = item.scheduledAt.slice(11, 16).split(':').map(Number);
    return {
      id: item.id,
      inProgress: item.status === 'IN_PROGRESS',
      staffId: item.employeeId ?? 0,
      customerName: item.customerName || 'Khách hàng',
      serviceName: item.serviceName,
      date: item.scheduledAt.slice(0, 10),
      startTime: time[0] + time[1] / 60,
      duration: item.durationMinutes / 60,
      status: item.status === 'PENDING' ? 'pending' : item.status === 'CONFIRMED' || item.status === 'IN_PROGRESS' ? 'confirmed' : item.status === 'COMPLETED' ? 'completed' : 'cancelled',
    };
  }

  soundEnabled = signal(false);
  ringing = signal(false);
  soundError = signal('');
  private audio?: AudioContext;
  private tones: OscillatorNode[] = [];
  private poll?: ReturnType<typeof setInterval>;
  private stopTimer?: ReturnType<typeof setTimeout>;
  private seen = new Set<number>();
  private salonId?: number;
  private disposed = false;
  private generation = 0;

  start(): void {
    if (!isPlatformBrowser(this.platformId) || this.poll) return;
    this.disposed = false;
    void this.loadSalonBookings();
    this.poll = setInterval(() => void this.loadSalonBookings(), 5000);
  }

  async enableSound(): Promise<void> {
    const generation = this.generation;
    try {
      this.audio ??= new AudioContext();
      await this.audio.resume();
      if (this.disposed || generation !== this.generation) return;
      this.soundEnabled.set(this.audio.state === 'running');
      this.soundError.set(this.soundEnabled() ? '' : 'Trình duyệt chưa cho phép âm thanh. Hãy bấm bật chuông lại.');
      this.alertNewBookings();
    } catch {
      if (generation !== this.generation) return;
      this.soundError.set('Không bật được âm thanh trên trình duyệt này.');
    }
  }

  private alertNewBookings(): void {
    if (!this.soundEnabled() || this.audio?.state !== 'running') return;
    const unseen = this.pendingBookings().filter(b => !this.seen.has(b.id));
    if (!unseen.length) return;
    unseen.forEach(b => this.seen.add(b.id));
    try { sessionStorage.setItem('ellora-booking-alerts-' + this.salonId, JSON.stringify([...this.seen])); } catch { /* Storage can be disabled. */ }
    // A burst of bookings shares one 30-second alarm instead of extending it indefinitely.
    if (this.ringing()) return;
    this.ringing.set(true);
    const start = this.audio.currentTime;
    for (let offset = 0; offset < 29; offset += 1.2) {
      for (const [delay, frequency] of [[0, 880], [0.3, 660]]) {
        const tone = this.audio.createOscillator();
        const gain = this.audio.createGain();
        const at = start + offset + delay;
        tone.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.15, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.28);
        tone.connect(gain); gain.connect(this.audio.destination);
        tone.onended = () => { tone.disconnect(); gain.disconnect(); };
        tone.start(at); tone.stop(at + 0.3);
        this.tones.push(tone);
      }
    }
    this.stopTimer = setTimeout(() => this.stopRinging(), 30000);
  }

  stopRinging(): void {
    clearTimeout(this.stopTimer);
    for (const tone of this.tones) { try { tone.stop(); } catch { /* Already stopped. */ } }
    this.tones = [];
    this.ringing.set(false);
  }

  stop(): void {
    this.disposed = true;
    this.generation++;
    this.isLoading.set(false);
    this.updatingBookings.set(new Set());
    this.bookings.set([]); this.pendingCount.set(0); this.focusedBookingId.set(null);
    this.salonName.set('');
    this.salonId = undefined; this.seen.clear(); this.error.set(''); this.soundError.set('');
    clearInterval(this.poll);
    this.poll = undefined;
    this.stopRinging();
    void this.audio?.close();
    this.audio = undefined;
    this.soundEnabled.set(false);
  }


  ngOnDestroy(): void { this.stop(); }

  async loadSalonBookings(): Promise<void> {
    if (this.isLoading() || this.disposed) return;
    const generation = this.generation;
    this.error.set(''); this.isLoading.set(true);
    try {
      const salon = await this.owner.salon();
      if (this.disposed || generation !== this.generation) return;
      this.salonName.set(salon.name);
      if (this.salonId !== salon.id) {
        this.stopRinging(); this.salonId = salon.id;
        try { this.seen = new Set(JSON.parse(sessionStorage.getItem('ellora-booking-alerts-' + salon.id) || '[]')); } catch { this.seen = new Set(); }
      }
      const items: BookingItem[] = [];
      for (let pageNumber = 0; ; pageNumber++) {
        const page = await this.api.getSalonBookings(salon.id, undefined, pageNumber, 100);
        if (this.disposed || generation !== this.generation) return;
        items.push(...page.content);
        if (page.last) break;
      }
      if (this.disposed || generation !== this.generation) return;
      this.bookings.set(items.map(item => this.map(item)));
      this.pendingCount.set(items.filter(item => item.status === 'PENDING').length);
      if (!this.pendingCount()) this.stopRinging();
      this.alertNewBookings();
    } catch (error) {
      if (generation !== this.generation) return;
      this.bookings.set([]); this.pendingCount.set(0); this.error.set(ownerError(error));
    } finally { if (generation === this.generation) this.isLoading.set(false); }
  }

  async acceptBooking(id: number): Promise<boolean> { return this.update(id, 'CONFIRMED'); }
  async rejectBooking(id: number): Promise<boolean> { return this.update(id, 'REJECTED'); }

  async startBooking(id: number): Promise<boolean> { return this.update(id, 'IN_PROGRESS'); }
  async completeBooking(id: number): Promise<boolean> {
    const booking = this.bookings().find(item => item.id === id);
    if (booking?.status === 'confirmed' && !booking.inProgress) {
      if (!await this.update(id, 'IN_PROGRESS')) return false;
    }
    return this.update(id, 'COMPLETED');
  }
  isUpdating(id: number): boolean { return this.updatingBookings().has(id); }
  private async update(id: number, status: 'CONFIRMED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED'): Promise<boolean> {
    if (this.isUpdating(id)) return false;
    const generation = this.generation;
    this.updatingBookings.update(ids => new Set(ids).add(id));
    try {
      await this.api.updateBookingStatus(id, { status });
      if (generation !== this.generation) return false;
      this.stopRinging();
      await this.loadSalonBookings();
      return true;
    } catch (error) { if (generation === this.generation) this.error.set(ownerError(error)); }
    finally { this.updatingBookings.update(ids => { const next = new Set(ids); next.delete(id); return next; }); }
    return false;
  }
}
