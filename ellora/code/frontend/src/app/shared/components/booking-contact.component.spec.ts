import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Clipboard } from '@angular/cdk/clipboard';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingContactComponent } from './booking-contact.component';
import { BookingEvent } from '../../services/booking.service';

describe('Owner appointment contact and clipboard actions', () => {
  let fixture: ComponentFixture<BookingContactComponent>;
  const clipboard = { copy: vi.fn() };
  const booking = {
    id: 19, customerName: 'Mai', customerPhone: ' 0901234567 ', serviceName: 'Sơn gel',
    date: '2026-10-19', startTime: 15 + 35 / 60, duration: 1, status: 'pending'
  } as BookingEvent;

  beforeEach(async () => {
    clipboard.copy.mockReset().mockReturnValue(true);
    await TestBed.configureTestingModule({
      imports: [BookingContactComponent],
      providers: [{ provide: Clipboard, useValue: clipboard }, { provide: PLATFORM_ID, useValue: 'browser' }]
    }).compileComponents();
    fixture = TestBed.createComponent(BookingContactComponent);
    fixture.componentRef.setInput('booking', booking);
    fixture.detectChanges();
  });
  afterEach(() => TestBed.resetTestingModule());

  it('shows and copies the complete phone including its leading zero', () => {
    expect(fixture.nativeElement.textContent).toContain('SĐT: 0901234567');
    fixture.nativeElement.querySelectorAll('button')[0].click();
    fixture.detectChanges();
    expect(clipboard.copy).toHaveBeenCalledWith('0901234567');
    expect(fixture.nativeElement.querySelector('[role=status]').textContent).toContain('Đã sao chép SĐT.');
  });

  it('copies a readable summary with service and precise Vietnam date/time', () => {
    fixture.nativeElement.querySelectorAll('button')[1].click();
    expect(clipboard.copy).toHaveBeenCalledWith(
      'Lịch hẹn #19\nKhách hàng: Mai\nSĐT: 0901234567\nDịch vụ: Sơn gel\nThời gian: 15:35 ngày 19/10/2026 (giờ Việt Nam)'
    );
  });

  it('labels a missing number and disables only the phone copy action', () => {
    fixture.componentRef.setInput('booking', { ...booking, customerPhone: null });
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(fixture.nativeElement.textContent).toContain('Chưa có số điện thoại');
    expect(buttons[0].disabled).toBe(true);
    buttons[0].click();
    expect(clipboard.copy).not.toHaveBeenCalled();
    buttons[1].click();
    expect(clipboard.copy).toHaveBeenCalledWith(expect.stringContaining('SĐT: Chưa có số điện thoại'));
  });

  it.each(['false', 'throw'])('reports clipboard failure (%s) without a success message', (failure) => {
    if (failure === 'throw') clipboard.copy.mockImplementation(() => { throw new Error('denied'); });
    else clipboard.copy.mockReturnValue(false);
    fixture.nativeElement.querySelectorAll('button')[1].click();
    fixture.detectChanges();
    const feedback = fixture.nativeElement.querySelector('[role=status]');
    expect(feedback.textContent).toContain('Không sao chép được');
    expect(feedback.classList.contains('copy-error')).toBe(true);
    expect(feedback.textContent).not.toContain('Đã sao chép');
  });

  it('keeps compact icon actions accessible and prevents notification navigation', () => {
    fixture.componentRef.setInput('compact', true); fixture.detectChanges();
    const navigate = vi.fn();
    fixture.nativeElement.addEventListener('click', navigate);
    const buttons = fixture.nativeElement.querySelectorAll('button');
    buttons[0].click(); buttons[1].click();
    expect(navigate).not.toHaveBeenCalled();
    expect(buttons[0].getAttribute('aria-label')).toBe('Sao chép số điện thoại của Mai');
    expect(buttons[1].getAttribute('aria-label')).toBe('Sao chép thông tin lịch hẹn của Mai');
    expect(fixture.nativeElement.classList.contains('compact')).toBe(true);
  });
});
