import { Component, OnDestroy, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PublicSalonSearchService, SearchFilters } from '../../../services/public-salon-search.service';

@Component({
  selector: 'app-salon-search-form', standalone: true, imports: [ReactiveFormsModule],
  templateUrl: './salon-search-form.component.html', styleUrl: './salon-search-form.component.scss'
})
export class SalonSearchFormComponent implements OnDestroy {
  readonly search = inject(PublicSalonSearchService);
  readonly value = input<SearchFilters | null>(null);
  readonly compact = input(false);
  readonly idPrefix = input('salon-search');
  readonly searched = output<SearchFilters>();
  get id(): string { return this.idPrefix(); }
  readonly submitting = signal(false);
  readonly error = signal('');
  readonly locationAttempted = signal(false);
  readonly radiusOptions = [1, 3, 5, 10, 20, 50, 100];
  private readonly now = signal(Date.now());
  readonly today = computed(() => this.vnParts(this.now()).date);
  readonly earliest = computed(() => this.vnParts(Math.ceil((this.now() + 3600000) / 60000) * 60000));
  readonly latestDate = computed(() => {
    const [year, month, day] = this.today().split('-').map(Number);
    return `${year + 1}-${String(month).padStart(2, '0')}-${String(Math.min(day, new Date(Date.UTC(year + 1, month, 0)).getUTCDate())).padStart(2, '0')}`;
  });
  private sort: SearchFilters['sort'] = 'newest';
  private locationVersion = 0;
  private destroyed = false;
  readonly form = inject(NonNullableFormBuilder).group({
    keyword: ['', Validators.maxLength(255)], location: ['', Validators.maxLength(255)],
    date: '', time: '', nearby: false, radiusKm: [5, (control: AbstractControl) => Number.isFinite(control.value) && control.value > 0 && control.value <= 100 ? null : { radius: true }]
  }, { validators: control => this.validateTime(control) });

  constructor() {
    effect(() => {
      const value = this.value() ?? this.search.filters();
      this.sort = value.sort;
      untracked(() => this.form.reset({ keyword: value.keyword, location: value.location, date: value.date, time: value.time, nearby: value.nearby, radiusKm: value.radiusKm }, { emitEvent: false }));
      this.error.set('');
    });
    this.form.controls.location.valueChanges.pipe(takeUntilDestroyed()).subscribe(value => {
      this.locationVersion++;
      if (!value.trim()) return;
      this.form.controls.nearby.setValue(false, { emitEvent: false });
      if (this.sort === 'distance') this.sort = 'newest';
      this.locationAttempted.set(false); this.search.clearLocation();
    });
  }

  refreshClock(): void { this.now.set(Date.now()); this.form.updateValueAndValidity({ emitEvent: false }); }

  async useLocation(): Promise<void> {
    const version = ++this.locationVersion;
    this.locationAttempted.set(true); this.error.set('');
    const granted = await this.search.requestLocation();
    if (this.destroyed || version !== this.locationVersion || !granted) return;
    this.form.patchValue({ location: '', nearby: true }, { emitEvent: false });
    this.sort = 'distance';
  }

  stopNearby(): void {
    this.locationVersion++; this.form.controls.nearby.setValue(false);
    if (this.sort === 'distance') this.sort = 'newest';
    this.locationAttempted.set(false); this.search.clearLocation();
  }

  async submit(): Promise<void> {
    if (this.submitting() || this.destroyed) return;
    this.refreshClock(); this.form.markAllAsTouched(); this.error.set('');
    if (this.form.invalid) { this.error.set('Kiểm tra từ khóa, khu vực, ngày và giờ tìm kiếm.'); return; }
    const value = this.form.getRawValue();
    if (value.nearby && !this.search.coordinates()) {
      this.error.set('Hãy dùng vị trí của bạn hoặc nhập khu vực để tìm tiệm.'); return;
    }
    const filters: SearchFilters = { ...value, keyword: value.keyword.trim(), location: value.location.trim(), sort: value.nearby ? this.sort : this.sort === 'distance' ? 'newest' : this.sort };
    this.submitting.set(true);
    try {
      if (await this.search.navigate(filters) && !this.destroyed) this.searched.emit(filters);
    } catch { if (!this.destroyed) this.error.set('Chưa mở được kết quả tìm kiếm. Vui lòng thử lại.'); }
    finally { if (!this.destroyed) this.submitting.set(false); }
  }

  private validateTime(control: AbstractControl): Record<string, boolean> | null {
    const date = control.get('date')?.value as string;
    const time = control.get('time')?.value as string;
    if (time && !date) return { dateRequired: true };
    if (!date) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z'))
      || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date || date < this.today() || date > this.latestDate()) return { dateRange: true };
    if (!time) return null;
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return { timeFormat: true };
    const earliest = this.earliest();
    return `${date}T${time}` < `${earliest.date}T${earliest.time}` ? { timeTooSoon: true } : null;
  }

  private vnParts(instant: number): { date: string; time: string } {
    const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
    const part = (name: string) => parts.find(value => value.type === name)!.value;
    return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
  }

  ngOnDestroy(): void { this.destroyed = true; this.locationVersion++; }
}
