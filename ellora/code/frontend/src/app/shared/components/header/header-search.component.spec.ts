import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../services/auth.service';
import { PublicSalonSearchService } from '../../../services/public-salon-search.service';
import { Header } from './header.component';

@Component({ standalone: true, template: '' }) class EmptyPage {}

describe('Header search integration', () => {
  let fixture: ComponentFixture<Header>;
  let router: Router;
  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Header], providers: [
      provideRouter([{ path: 'search', component: EmptyPage }, { path: 'salon/:id', component: EmptyPage }]),
      { provide: AuthService, useValue: { isAuthenticated: vi.fn().mockResolvedValue(false) } }
    ] });
    router = TestBed.inject(Router); await router.navigateByUrl('/salon/1');
    fixture = TestBed.createComponent(Header); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  });
  afterEach(() => { fixture?.destroy(); TestBed.resetTestingModule(); });

  it('opens the real shared form and navigates all filters to search, then closes the panel', async () => {
    const trigger = fixture.nativeElement.querySelector('.header-search-trigger') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false'); trigger.click(); fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[role=dialog]') as HTMLElement;
    expect(dialog).not.toBeNull(); expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const set = (suffix: string, value: string) => {
      const field = dialog.querySelector('#header-salon-search-' + suffix) as HTMLInputElement;
      field.value = value; field.dispatchEvent(new Event('input')); fixture.detectChanges();
    };
    set('keyword', 'Sơn gel'); set('location', 'Quận 1');
    const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    set('date', tomorrow); set('time', '14:07');
    dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable(); fixture.detectChanges();
    const url = router.parseUrl(router.url);
    expect(url.queryParams).toMatchObject({ keyword: 'Sơn gel', location: 'Quận 1', date: tomorrow, time: '14:07' });
    expect(router.url.startsWith('/search?')).toBe(true); expect(fixture.nativeElement.querySelector('[role=dialog]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.header-search-trigger').textContent).toContain('Sơn gel');
    expect(TestBed.inject(PublicSalonSearchService).coordinates()).toBeNull();
    const currentUrl = router.url;
    (fixture.nativeElement.querySelector('.header-search-trigger') as HTMLButtonElement).click(); fixture.detectChanges();
    fixture.nativeElement.querySelector('[role=dialog] form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable(); fixture.detectChanges();
    expect(router.url).toBe(currentUrl); expect(fixture.nativeElement.querySelector('[role=dialog]')).toBeNull();
  });

  it('closes on Escape and reopens with the shared filters, without a mock calendar', () => {
    const state = TestBed.inject(PublicSalonSearchService);
    state.filters.update(value => ({ ...value, keyword: 'Nail', location: 'Hà Nội' }));
    (fixture.nativeElement.querySelector('.header-search-trigger') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#header-salon-search-location').value).toBe('Hà Nội');
    expect(fixture.nativeElement.querySelector('input[type=date]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=dialog]')).toBeNull();
    expect(fixture.componentInstance.isSearchActive).toBe(false);
  });
});
