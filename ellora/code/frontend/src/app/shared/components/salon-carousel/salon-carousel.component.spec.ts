import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { RevealOnScrollDirective } from '../../directives/reveal-on-scroll.directive';
import { SalonCarouselComponent } from './salon-carousel.component';

describe('Salon carousel responsive rendering and scrolling',()=>{
  let fixture:ComponentFixture<SalonCarouselComponent>;
  beforeEach(()=>{
    vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false})));
    vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect(){}});
  });
  afterEach(()=>{fixture?.destroy();TestBed.resetTestingModule();vi.unstubAllGlobals();vi.restoreAllMocks();});
  function mount(platform='browser'){
    TestBed.configureTestingModule({imports:[SalonCarouselComponent],providers:[provideRouter([]),{provide:PLATFORM_ID,useValue:platform}]});
    fixture=TestBed.createComponent(SalonCarouselComponent);
    fixture.componentRef.setInput('title','Khám phá');fixture.componentRef.setInput('viewAllLink','/search');
    fixture.componentRef.setInput('salons',Array.from({length:8},(_,id)=>({id:String(id),name:'Tiệm '+id,images:['/salon-placeholder.svg'],address:'',city:'',rating:0,reviewCount:0,coordinates:null})));
    fixture.detectChanges();return fixture.nativeElement as HTMLElement;
  }

  it('bounds later-card stagger while photos need no extra observer reveal',()=>{
    const root=mount();
    const reveals=fixture.debugElement.queryAll(By.directive(RevealOnScrollDirective)).map(node=>node.injector.get(RevealOnScrollDirective));
    expect(reveals.every(reveal=>reveal.revealDelay<=180)).toBe(true);
    expect(root.querySelectorAll('img')).toHaveLength(8);
    expect([...root.querySelectorAll('img')].every(image=>image.style.opacity==='')).toBe(true);
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/search');
  });

  it('scrolls using native immediate behavior for reduced motion',()=>{
    const root=mount();const row=fixture.componentInstance.scrollContainer.nativeElement;
    Object.defineProperty(row,'clientWidth',{value:900});const scroll=vi.fn();row.scrollBy=scroll;
    vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true})));
    (root.querySelector('[aria-label="Cuộn salon sang phải"]') as HTMLButtonElement).click();
    expect(scroll).toHaveBeenCalledWith({left:300,behavior:'instant'});
    fixture.componentInstance.scrollLeft();expect(scroll).toHaveBeenLastCalledWith({left:-300,behavior:'instant'});
  });

  it('renders visible server cards without browser-only setup',()=>{
    const media=vi.mocked(window.matchMedia);const root=mount('server');
    expect(media).not.toHaveBeenCalled();expect(root.querySelectorAll('img')).toHaveLength(8);
    expect(root.textContent).toContain('Tiệm 0');
  });
});
