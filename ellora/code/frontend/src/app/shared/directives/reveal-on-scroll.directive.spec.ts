import { Component, PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RevealOnScrollDirective } from './reveal-on-scroll.directive';

@Component({ standalone:true, imports:[RevealOnScrollDirective], template:'<section appRevealOnScroll="fade-up" [revealDuration]="0">Thông tin đã tải</section>' })
class RevealHost {}

describe('RevealOnScrollDirective in a zoneless page', () => {
  let fixture: ComponentFixture<RevealHost>;
  let callback: IntersectionObserverCallback;
  const observer = { observe:vi.fn(), disconnect:vi.fn() };
  const intersect = (visible=true) => callback([{isIntersecting:visible} as IntersectionObserverEntry],observer as unknown as IntersectionObserver);
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false})));
    vi.stubGlobal('IntersectionObserver',class {
      observe=observer.observe; disconnect=observer.disconnect;
      constructor(next:IntersectionObserverCallback){callback=next;}
    });
  });
  afterEach(() => { fixture?.destroy(); TestBed.resetTestingModule(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  function mount(platform='browser') {
    TestBed.configureTestingModule({imports:[RevealHost],providers:[{provide:PLATFORM_ID,useValue:platform}]});
    fixture=TestBed.createComponent(RevealHost); fixture.detectChanges();
    return fixture.nativeElement.querySelector('section') as HTMLElement;
  }

  it('renders observer entry and timer release without another click or manual change detection', async () => {
    const section=mount(); expect(section.style.opacity).toBe('0');
    intersect(false); expect(section.style.opacity).toBe('0');
    intersect(); await fixture.whenStable();
    expect(section.style.opacity).toBe('1');
    expect(section.classList.contains('reveal-has-entered')).toBe(true);
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    await new Promise(resolve=>setTimeout(resolve,100)); await fixture.whenStable();
    expect(section.style.opacity).toBe(''); expect(section.style.transform).toBe('');
    expect(section.style.transition).toBe(''); expect(section.style.willChange).toBe('');
  });

  it('does not restart a one-shot reveal and ignores a queued callback after destroy', () => {
    mount(); const directive=fixture.debugElement.query(By.directive(RevealOnScrollDirective)).injector.get(RevealOnScrollDirective);
    const timer=vi.spyOn(globalThis,'setTimeout');
    intersect(); intersect(); expect(timer.mock.calls.filter(call=>call[1]===80)).toHaveLength(1);
    fixture.destroy(); intersect(); expect(timer.mock.calls.filter(call=>call[1]===80)).toHaveLength(1);
    expect(directive.revealHasEntered).toBe(true);
  });

  it('cancels delayed release when destroyed before the entry transition ends', async () => {
    mount(); const directive=fixture.debugElement.query(By.directive(RevealOnScrollDirective)).injector.get(RevealOnScrollDirective);
    intersect(); fixture.destroy();
    await new Promise(resolve=>setTimeout(resolve,100));
    expect(directive.willChange).toBe('opacity, transform');
  });

  it.each(['server','reduced','no-observer','no-media'])('keeps content visible with no compositor hint for %s', mode => {
    if(mode==='reduced')vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true})));
    if(mode==='no-observer')vi.stubGlobal('IntersectionObserver',undefined);
    if(mode==='no-media')vi.stubGlobal('matchMedia',undefined);
    const section=mount(mode==='server'?'server':'browser');
    expect(section.style.opacity).toBe(''); expect(section.style.transform).toBe('');
    expect(section.style.transition).toBe(''); expect(section.style.willChange).toBe('');
    expect(observer.observe).not.toHaveBeenCalled();
  });
});
