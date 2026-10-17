import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WalkInFormComponent } from './walk-in-form.component';
import { BookingApiService } from '../../../services/booking-api.service';

describe('Owner walk-in form', () => {
  const api = { createWalkIn: vi.fn() };
  let fixture: ReturnType<typeof TestBed.createComponent<WalkInFormComponent>>;
  beforeEach(() => {
    api.createWalkIn.mockReset(); TestBed.configureTestingModule({ providers: [{ provide: BookingApiService, useValue: api }] });
    fixture = TestBed.createComponent(WalkInFormComponent);
    fixture.componentRef.setInput('services', [{ id: 2, name: 'Sơn gel', durationMinutes: 60, price: 150000, active: true }]);
    fixture.componentRef.setInput('employees', [{ id: 3, fullName: 'Linh', active: true }]);
  });
  afterEach(() => { fixture.destroy(); TestBed.resetTestingModule(); });
  it('creates a guest with optional contact details and releases the form before notifying its parent', async () => {
    const component = fixture.componentInstance; const saved = { id: 7, customerName: 'Khách vãng lai' };
    component.form.patchValue({ serviceId: '2', date: '2026-10-15', time: '10:00' }); api.createWalkIn.mockResolvedValue(saved);
    const emit = vi.fn(() => expect(component.saving()).toBe(false)); component.saved.subscribe(emit);
    await component.save();
    expect(api.createWalkIn).toHaveBeenCalledWith({ serviceId: 2, employeeId: undefined, scheduledAt: '2026-10-15T10:00:00', customerName: '', customerPhone: '', customerNote: '' });
    expect(emit).toHaveBeenCalledWith(saved);
  });
  it('blocks incomplete or off-grid times without creating a booking', async () => {
    const component = fixture.componentInstance; await component.save();
    component.form.patchValue({ serviceId: '2', date: '2026-10-15', time: '10:15' }); await component.save();
    expect(api.createWalkIn).not.toHaveBeenCalled(); expect(component.error()).not.toBe('');
  });
  it('preserves entered details and displays an availability rejection', async () => {
    const component = fixture.componentInstance;
    component.form.patchValue({ serviceId: '2', employeeId: '3', date: '2026-10-15', time: '10:00', customerName: 'Mai' });
    api.createWalkIn.mockRejectedValue(new HttpErrorResponse({ status: 400, error: { message: 'Nhân viên đã có lịch.' } }));
    await component.save(); expect(component.error()).toBe('Nhân viên đã có lịch.');
    expect(component.form.controls.customerName.value).toBe('Mai'); expect(component.saving()).toBe(false);
  });
});
