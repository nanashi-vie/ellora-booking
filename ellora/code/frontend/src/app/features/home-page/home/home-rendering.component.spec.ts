import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockDataService } from '../../../services/mock-data.service';
import { SalonApiService } from '../../../services/salon-api.service';
import { Home } from './home.component';

describe('Home rendering cost and loaded media', () => {
  let fixture:ComponentFixture<Home>;
  const unusedFixture=vi.fn(()=>{throw new Error('Home must not construct unused fixture data');});
  beforeEach(()=>{
    unusedFixture.mockClear();
    vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
    vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect(){}});
    const salon={id:'1',name:'Tiệm đang mở',images:['/salon-placeholder.svg'],address:'12 Lê Lợi',city:'HCM',rating:4.8,reviewCount:0,coordinates:null};
    TestBed.configureTestingModule({imports:[Home],providers:[provideRouter([]),
      {provide:MockDataService,useFactory:unusedFixture},
      {provide:SalonApiService,useValue:{search:async()=>({content:[salon]}),searchFiltered:async()=>({content:[]})}}
    ]});
  });
  afterEach(()=>{fixture?.destroy();TestBed.resetTestingModule();vi.unstubAllGlobals();});
  async function mount(){fixture=TestBed.createComponent(Home);fixture.detectChanges();for(let turn=0;turn<10;turn++)await Promise.resolve();await fixture.whenStable();return fixture.nativeElement as HTMLElement;}

  it('shows loaded discovery photos without waiting for an intersection event and avoids unused fixture construction',async()=>{
    const root=await mount();
    const photo=root.querySelector('app-salon-card img') as HTMLImageElement;
    expect(unusedFixture).not.toHaveBeenCalled();
    expect(photo).not.toBeNull();expect(photo.style.opacity).toBe('');expect(photo.style.transform).toBe('');
    expect(photo.closest('a')?.getAttribute('href')).toBe('/salon/1');
    expect(root.textContent).toContain('Tiệm đang mở');
    expect(root.querySelector('app-salon-search-form input')).not.toBeNull();
  });

  it('defers the below-fold dashboard image with its actual intrinsic aspect ratio',async()=>{
    const root=await mount();const image=root.querySelector('img[src="/owner-pageDemo.png"]')!;
    expect(image.getAttribute('loading')).toBe('lazy');expect(image.getAttribute('decoding')).toBe('async');
    expect(image.getAttribute('fetchpriority')).toBe('low');
    expect([image.getAttribute('width'),image.getAttribute('height')]).toEqual(['1280','1024']);
  });

  it('uses immediate native back-to-top scrolling when reduced motion is requested',async()=>{
    await mount();const scroll=vi.fn();vi.stubGlobal('scrollTo',scroll);
    vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true})));
    fixture.componentInstance.scrollToTop();expect(scroll).toHaveBeenCalledWith({top:0,behavior:'instant'});
  });
});
