import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkingHoursComponent } from './working-hours.component';
import { OwnerApiService } from '../../../services/owner-api.service';

describe('Owner hours and planned closures', () => {
  const api = { workingHours: vi.fn(), saveWorkingHours: vi.fn(), closures: vi.fn(), closeDate: vi.fn(), reopenDate: vi.fn() };
  let component: WorkingHoursComponent;
  beforeEach(async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T03:00:00Z')); vi.resetAllMocks();
    api.workingHours.mockResolvedValue(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
      .map(dayOfWeek => ({ dayOfWeek, openTime: '09:00:00', closeTime: '18:00:00', closed: dayOfWeek === 'SUNDAY' })));
    api.closures.mockResolvedValue([]); api.saveWorkingHours.mockResolvedValue([]);
    TestBed.configureTestingModule({ providers: [{ provide: OwnerApiService, useValue: api }] });
    component = TestBed.runInInjectionContext(() => new WorkingHoursComponent());
    await component.load(); await component.loadClosures();
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); });

  it('restores saved hours and applies a common interval before a separate closed-day override', async () => {
    expect(component.weeklyForm.controls.days.at(0).controls.closeTime.value).toBe('18:00');
    component.weeklyForm.patchValue({ openTime: '09:00', closeTime: '19:00' }); component.applyAll();
    component.weeklyForm.controls.days.at(0).controls.closed.setValue(true);
    await component.saveHours();
    const days = api.saveWorkingHours.mock.calls[0][0];
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ dayOfWeek: 'MONDAY', closed: true, openTime: null, closeTime: null });
    expect(days[6]).toMatchObject({ dayOfWeek: 'SUNDAY', closed: false, openTime: '09:00', closeTime: '19:00' });
    expect(component.error()).toBe('');
  });
  it('rejects invalid intervals without saving and retains edits after a save failure', async () => {
    component.weeklyForm.controls.days.at(0).controls.closeTime.setValue('08:00');
    await component.saveHours(); expect(api.saveWorkingHours).not.toHaveBeenCalled();
    component.weeklyForm.controls.days.at(0).controls.closeTime.setValue('19:00');
    api.saveWorkingHours.mockRejectedValue(new HttpErrorResponse({ status: 400, error: { message: 'Không thể đóng cửa hôm nay.' } }));
    await component.saveHours(); expect(component.error()).toContain('Không thể đóng cửa hôm nay');
    expect(component.weeklyForm.controls.days.at(0).controls.closeTime.value).toBe('19:00');
    expect(component.saving()).toBe(false);
  });
  it('only allows tomorrow or later and lists a newly saved closure', async () => {
    expect(component.minClosureDate()).toBe('2026-10-12');
    component.closureForm.patchValue({ date: '2026-10-11', reason: 'Bận' }); await component.addClosure();
    expect(api.closeDate).not.toHaveBeenCalled();
    component.selectClosureDate('2026-10-12');
    component.closureForm.controls.reason.setValue('Bận');
    api.closeDate.mockResolvedValue({ id: 9, date: '2026-10-12', reason: 'Bận' });
    await component.addClosure(); expect(api.closeDate).toHaveBeenCalledWith('2026-10-12', 'Bận');
    expect(component.closures()[0].id).toBe(9); expect(component.closureError()).toBe('');
    expect(component.selectedDate()).toBe('2026-10-12');
    expect(component.closureForm.controls.date.value).toBe('2026-10-12');
    expect(component.dateClosed()).toBe(true);
  });
  it('supports calendar month rollover and does not select today', () => {
    component.selectClosureDate('2026-10-11'); expect(component.closureForm.controls.date.value).toBe('2026-10-12');
    expect(component.calendarDays().filter(day => day.currentMonth)).toHaveLength(31);
    component.calendarMonth.set('2026-12'); component.changeMonth(1); expect(component.calendarMonth()).toBe('2027-01');
    vi.setSystemTime(new Date('2026-12-31T20:00:00Z'));
    expect(component.minClosureDate()).toBe('2027-01-02');
  });
  it('does not pretend an unsuccessful load is an empty schedule', async () => {
    api.workingHours.mockRejectedValue(new Error('offline')); api.closures.mockRejectedValue(new Error('offline'));
    await component.load(); await component.loadClosures();
    expect(component.loaded()).toBe(false); expect(component.closuresLoaded()).toBe(false);
    expect(component.error()).not.toBe(''); expect(component.closureError()).not.toBe('');
  });
  it('removes a planned closure without restoring rejected bookings', async () => {
    const closure = { id: 9, date: '2026-10-12', reason: 'Bận' }; component.closures.set([closure]);
    await component.removeClosure(closure); expect(api.reopenDate).toHaveBeenCalledWith(9);
    expect(component.closures()).toEqual([]); expect(component.closureMessage()).toContain('không tự khôi phục');
  });
  it('renders the clean month calendar with today disabled and selectable future days', async () => {
    const fixture = TestBed.createComponent(WorkingHoursComponent); fixture.detectChanges();
    for (let i = 0; i < 8; i++) await Promise.resolve(); fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const today = root.querySelector<HTMLButtonElement>('[aria-label^="11/10/2026"]')!;
    const tomorrow = root.querySelector<HTMLButtonElement>('[aria-label="12/10/2026"]')!;
    expect(root.querySelectorAll('section.card')).toHaveLength(1);
    expect(root.textContent).toContain('Giờ mở cửa & ngày nghỉ');
    expect(today.disabled).toBe(true); expect(tomorrow.disabled).toBe(false);
    tomorrow.click(); fixture.detectChanges();
    expect(tomorrow.getAttribute('aria-pressed')).toBe('true');
    expect(fixture.componentInstance.closureForm.controls.date.value).toBe('2026-10-12');
    fixture.destroy();
  });

  it('keeps the selected-day inputs in sync with the full-week editor', async () => {
    const fixture = TestBed.createComponent(WorkingHoursComponent); fixture.detectChanges();
    for (let i = 0; i < 8; i++) await Promise.resolve(); fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const selectedOpen = root.querySelector<HTMLInputElement>('.day-editor input[type=time]')!;
    const weeklyOpen = root.querySelector<HTMLInputElement>('[aria-label="Giờ mở Thứ hai"]')!;
    selectedOpen.value = '10:00'; selectedOpen.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    expect(weeklyOpen.value).toBe('10:00');
    weeklyOpen.value = '11:00'; weeklyOpen.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    expect(selectedOpen.value).toBe('11:00');
    fixture.destroy();
  });

  it('maps a selected calendar date to the correct recurring weekday and saves all seven days', async () => {
    component.selectClosureDate('2026-10-18');
    expect(component.selectedDay()?.controls.dayOfWeek.value).toBe('SUNDAY');
    expect(component.isWeeklyClosed('2026-10-18')).toBe(true);
    component.selectClosureDate('2026-10-13');
    component.selectedDay()!.patchValue({ openTime: '10:00', closeTime: '19:00' });
    await component.saveHours();
    const days = api.saveWorkingHours.mock.calls[0][0];
    expect(days).toHaveLength(7);
    expect(days[1]).toMatchObject({ dayOfWeek: 'TUESDAY', openTime: '10:00', closeTime: '19:00' });
    expect(days[0]).toMatchObject({ dayOfWeek: 'MONDAY', openTime: '09:00', closeTime: '18:00' });
    component.calendarMonth.set('2026-12'); component.changeMonth(1); component.selectClosureDate('2027-01-01');
    expect(component.selectedDay()?.controls.dayOfWeek.value).toBe('FRIDAY');
  });

  it('removes a selected exception while preserving a weekly closed day and unsaved hours', async () => {
    const closure = { id: 9, date: '2026-10-18', reason: 'Bận' };
    component.closures.set([closure]); component.selectClosureDate(closure.date);
    expect(component.dateClosed()).toBe(true);
    component.weeklyForm.controls.days.at(0).controls.openTime.setValue('10:00');
    component.dateClosed.set(false); await component.saveSelectedClosure();
    expect(api.reopenDate).toHaveBeenCalledWith(9);
    expect(component.selectedDate()).toBe(closure.date);
    expect(component.dateClosed()).toBe(false);
    expect(component.isWeeklyClosed(closure.date)).toBe(true);
    expect(component.weeklyForm.controls.days.at(0).controls.openTime.value).toBe('10:00');
    expect(api.saveWorkingHours).not.toHaveBeenCalled();
  });

  it('retains the selected day, reason and hour edits when saving an exception fails', async () => {
    component.selectClosureDate('2026-10-13'); component.dateClosed.set(true);
    component.closureForm.controls.reason.setValue('Bận');
    component.selectedDay()!.controls.openTime.setValue('10:00');
    api.closeDate.mockRejectedValue(new Error('offline'));
    await component.saveSelectedClosure();
    expect(component.selectedDate()).toBe('2026-10-13');
    expect(component.closureForm.controls.reason.value).toBe('Bận');
    expect(component.selectedDay()!.controls.openTime.value).toBe('10:00');
    expect(component.closureError()).not.toBe('');
    expect(api.saveWorkingHours).not.toHaveBeenCalled();
  });

  it('updates both selected weekday and calendar when common hours are applied', () => {
    component.selectClosureDate('2026-10-18'); expect(component.selectedDay()!.controls.closed.value).toBe(true);
    component.weeklyForm.patchValue({ openTime: '09:00', closeTime: '19:00' }); component.applyAll();
    expect(component.selectedDay()!.controls.closed.value).toBe(false);
    expect(component.selectedDay()!.controls.closeTime.value).toBe('19:00');
    expect(component.isWeeklyClosed('2026-10-18')).toBe(false);
    expect(api.saveWorkingHours).not.toHaveBeenCalled();
  });
});
