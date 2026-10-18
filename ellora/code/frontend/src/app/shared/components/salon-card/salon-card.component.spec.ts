import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Salon } from '../../../models/ellora.model';
import { SalonCard } from './salon-card.component';

describe('SalonCard', () => {
  let fixture: ComponentFixture<SalonCard>;

  const salon: Salon = {
    id: 'salon-1',
    name: 'A Very Long Salon Name That Should Stay Tidy Beside Rating',
    description: 'Premium nail care.',
    address: '123 Blossom Street',
    city: 'Ho Chi Minh City',
    coordinates: { lat: 10.7769, lng: 106.7009 },
    rating: 4.8,
    reviewCount: 128,
    images: ['/salon-cover.jpg'],
  };

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    class MockIntersectionObserver {
      observe = vi.fn();
      disconnect = vi.fn();
    }

    Object.defineProperty(window, 'IntersectionObserver', {
      writable: true,
      value: MockIntersectionObserver,
    });

    await TestBed.configureTestingModule({
      imports: [SalonCard],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SalonCard);
    fixture.componentRef.setInput('salon', salon);
  });

  it('keeps the default search card presentation by default', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain(salon.name);
    expect(compiled.textContent).not.toContain('Nail Salon');
    expect(compiled.textContent).toContain('Xem tiệm');
    expect(compiled.querySelector('.absolute')).toBeTruthy();
  });

  it('renders the home carousel presentation when requested', () => {
    fixture.componentRef.setInput('variant', 'home');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const link = compiled.querySelector('a');
    const image = compiled.querySelector('img');
    const cover = image?.parentElement;
    const title = compiled.querySelector('h3');
    const rating = compiled.querySelector('span');
    const star = compiled.querySelector('svg');

    expect(link?.getAttribute('href')).toBe('/salon/salon-1');
    expect(image?.getAttribute('alt')).toBe(salon.name);
    expect(image?.getAttribute('loading')).toBe('lazy');
    expect(image?.getAttribute('decoding')).toBe('async');
    expect(image?.getAttribute('width')).toBe('600');
    expect(image?.getAttribute('height')).toBe('400');
    expect(image?.style.opacity).toBe('');
    expect(image?.style.willChange).toBe('');
    expect(cover?.className).toContain('aspect-[3/2]');
    expect(title?.className).toContain('truncate');
    expect(rating?.className).toContain('whitespace-nowrap');
    expect(compiled.textContent).toContain(salon.name);
    expect(compiled.textContent).toContain('4.8');
    expect(compiled.textContent).toContain('Ho Chi Minh City');
    expect(compiled.textContent).toContain('Nail Salon · 128 đánh giá');
    expect(compiled.textContent).not.toContain(salon.description);
    expect(compiled.textContent).not.toContain('Đặt ngay');
    expect(compiled.querySelector('.absolute')).toBeFalsy();
    expect(star?.getAttribute('aria-hidden')).toBe('true');
  });
});
