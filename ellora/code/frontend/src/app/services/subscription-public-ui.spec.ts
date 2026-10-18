import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiConfig } from '../config/api.config';
import { ForBusiness } from '../features/home-page/for-business/for-business.component';
import { SalonPlansComponent } from '../features/home-page/for-business/salon-plans.component';
import { SalonDetails } from '../features/salon-details/salon-details.component';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { Salon } from '../models/ellora.model';
import { SalonCard } from '../shared/components/salon-card/salon-card.component';
import { SalonSubscriptionBadgeComponent } from '../shared/components/salon-subscription-badge.component';
import { AuthService } from './auth.service';
import { SalonApiService } from './salon-api.service';
import { SubscriptionApiService, SubscriptionPlan } from './subscription-api.service';

describe('Public subscription API data', () => {
  let http: HttpTestingController;
  let salons: SalonApiService;
  let subscriptions: SubscriptionApiService;
  const auth = { getAccessToken: vi.fn() };
  const summary = (id: number, extra: object = {}) => ({ id, name: 'Tiệm ' + id, address: '12 Lê Lợi', city: 'HCM', ...extra });
  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), { provide: AuthService, useValue: auth }] });
    http = TestBed.inject(HttpTestingController); salons = TestBed.inject(SalonApiService); subscriptions = TestBed.inject(SubscriptionApiService);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('preserves effective tier and badge from actual public summaries without reordering the server page', async () => {
    const pending = salons.searchFiltered({ sort: 'rating' });
    http.expectOne(request => request.url === apiConfig.baseUrl + '/customer/salons').flush({ data: { content: [
      summary(3, { subscriptionTier: 'VIP', subscriptionBadge: 'Shop đối tác' }),
      summary(1, { subscriptionTier: 'STANDARD', subscriptionBadge: 'Shop yêu thích' }), summary(2),
    ], totalElements: 3, last: true, pageNumber: 0 } });
    const page = await pending;
    expect(page.content.map(salon => salon.id)).toEqual(['3', '1', '2']);
    expect(page.content[0]).toMatchObject({ subscriptionTier: 'VIP', subscriptionBadge: 'Shop đối tác' });
    expect(page.content[1]).toMatchObject({ subscriptionTier: 'STANDARD', subscriptionBadge: 'Shop yêu thích' });
    expect(page.content[2]).toMatchObject({ subscriptionTier: null, subscriptionBadge: null });
  });

  it('maps a public detail entitlement and removes it when a later response has expired to null', async () => {
    const active = salons.detail('1');
    http.expectOne(apiConfig.baseUrl + '/customer/salons/1').flush({ data: summary(1, { subscriptionTier: 'VIP', subscriptionBadge: 'Shop đối tác' }) });
    expect(await active).toMatchObject({ subscriptionTier: 'VIP', subscriptionBadge: 'Shop đối tác' });
    const expired = salons.detail('1');
    http.expectOne(apiConfig.baseUrl + '/customer/salons/1').flush({ data: summary(1, { subscriptionTier: null, subscriptionBadge: null }) });
    expect(await expired).toMatchObject({ subscriptionTier: null, subscriptionBadge: null });
  });

  it('retrieves both unconfigured catalog rows without inventing a monthly price', async () => {
    const pending = subscriptions.plans();
    const catalog = [
      { tier: 'STANDARD', displayName: 'Thường', badgeLabel: 'Shop yêu thích', monthlyPrice: null, enabled: false, registrationAvailable: false, currency: 'VND', termMonths: 1 },
      { tier: 'VIP', displayName: 'VIP', badgeLabel: 'Shop đối tác', monthlyPrice: null, enabled: false, registrationAvailable: false, currency: 'VND', termMonths: 1 },
    ];
    const request = http.expectOne(apiConfig.baseUrl + '/salon-plans'); expect(request.request.method).toBe('GET');
    request.flush({ data: catalog }); expect(await pending).toEqual(catalog);
  });

  it('preserves a legacy zero without enabling registration and retains the actual positive server price', async () => {
    const pending = subscriptions.plans();
    const catalog = [
      { tier: 'STANDARD', displayName: 'Thường', badgeLabel: 'Shop yêu thích', monthlyPrice: 0, enabled: true, registrationAvailable: false, currency: 'VND', termMonths: 1 },
      { tier: 'VIP', displayName: 'VIP', badgeLabel: 'Shop đối tác', monthlyPrice: 347000, enabled: true, registrationAvailable: true, currency: 'VND', termMonths: 1 },
    ];
    http.expectOne(apiConfig.baseUrl + '/salon-plans').flush({ data: catalog }); expect(await pending).toEqual(catalog);
  });

  it('reads the public catalog without obtaining a Cognito token or attaching authorization', async () => {
    const pending = subscriptions.plans(); const request = http.expectOne(apiConfig.baseUrl + '/salon-plans');
    expect(auth.getAccessToken).not.toHaveBeenCalled(); expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ data: [] }); expect(await pending).toEqual([]);
  });

  it('does not infer a badge from an unknown tier or an orphaned server label', async () => {
    const pending = salons.searchFiltered();
    http.expectOne(request => request.url === apiConfig.baseUrl + '/customer/salons').flush({ data: { content: [
      summary(1, { subscriptionTier: 'SUPER_VIP', subscriptionBadge: 'Shop đối tác' }),
      summary(2, { subscriptionTier: null, subscriptionBadge: 'Shop yêu thích' }),
    ], totalElements: 2, last: true, pageNumber: 0 } });
    expect((await pending).content).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: '1', subscriptionTier: null, subscriptionBadge: null }),
      expect.objectContaining({ id: '2', subscriptionTier: null, subscriptionBadge: null }),
    ]));
  });
});

const publicSalon: Salon = {
  id: '1', name: 'Tiệm Ellora', description: '', address: '12 Lê Lợi', city: 'HCM', coordinates: null,
  images: ['/salon-placeholder.svg'], rating: 4.5, reviewCount: 2, subscriptionTier: 'VIP', subscriptionBadge: 'Shop đối tác'
};
const configuredPlans: SubscriptionPlan[] = [
  { tier: 'STANDARD', displayName: 'Thường', badgeLabel: 'Shop yêu thích', monthlyPrice: 127000, enabled: true, registrationAvailable: true, currency: 'VND', termMonths: 1 },
  { tier: 'VIP', displayName: 'VIP', badgeLabel: 'Shop đối tác', monthlyPrice: 347000, enabled: true, registrationAvailable: true, currency: 'VND', termMonths: 1 },
];
const unconfiguredPlans = configuredPlans.map(plan => ({ ...plan, monthlyPrice: null, enabled: false, registrationAvailable: false }));

describe('Public subscription badge placement', () => {
  let fixture: ComponentFixture<unknown> | undefined;
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });
  afterEach(() => { fixture?.destroy(); fixture = undefined; TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  it('shows the two fixed plan badges and clears the label when no effective tier remains', () => {
    const badge = TestBed.createComponent(SalonSubscriptionBadgeComponent); fixture = badge;
    badge.componentRef.setInput('tier', 'STANDARD'); badge.detectChanges();
    expect(badge.nativeElement.textContent).toContain('Shop yêu thích'); expect(badge.nativeElement.querySelector('span').title).toContain('gói Thường');
    badge.componentRef.setInput('tier', 'VIP'); badge.detectChanges();
    expect(badge.nativeElement.textContent).toContain('Shop đối tác'); expect(badge.nativeElement.querySelector('span').title).toContain('gói VIP');
    badge.componentRef.setInput('tier', null); badge.detectChanges(); expect(badge.nativeElement.querySelector('span')).toBeNull();
  });

  it.each(['default', 'home'])('renders the effective badge in the %s card and removes it after expiry', variant => {
    const card = TestBed.createComponent(SalonCard); fixture = card;
    card.componentRef.setInput('salon', publicSalon); card.componentRef.setInput('variant', variant); card.detectChanges();
    expect(card.nativeElement.querySelector('app-salon-subscription-badge')?.textContent).toContain('Shop đối tác');
    expect(card.nativeElement.querySelector('a')?.getAttribute('href')).toBe('/salon/1');
    card.componentRef.setInput('salon', { ...publicSalon, subscriptionTier: null, subscriptionBadge: null }); card.detectChanges();
    expect(card.nativeElement.querySelector('app-salon-subscription-badge')).toBeNull();
  });

  it('uses effective badges on the actual detail and nearby cards while retaining a no-plan salon without a badge', async () => {
    const api = {
      detail: vi.fn().mockResolvedValue(publicSalon), services: vi.fn().mockResolvedValue([]), reviews: vi.fn().mockResolvedValue({ content: [] }),
      workingHours: vi.fn().mockResolvedValue([]), searchFiltered: vi.fn().mockResolvedValue({ content: [] }),
      search: vi.fn().mockResolvedValue({ content: [{ ...publicSalon, id: '2', subscriptionTier: 'STANDARD', subscriptionBadge: 'Shop yêu thích' }, { ...publicSalon, id: '3', subscriptionTier: null, subscriptionBadge: null }] })
    };
    TestBed.configureTestingModule({ providers: [
      { provide: SalonApiService, useValue: api }, { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '1' })) } }
    ] });
    const detail = TestBed.createComponent(SalonDetails); fixture = detail; detail.detectChanges();
    for (let i = 0; i < 12; i++) await Promise.resolve(); detail.detectChanges();
    const root = detail.nativeElement as HTMLElement;
    expect(root.querySelector('app-salon-subscription-badge')?.textContent).toContain('Shop đối tác');
    const nearby = root.querySelectorAll('.venue-card'); expect(nearby).toHaveLength(2);
    expect(nearby[0].querySelector('app-salon-subscription-badge')?.textContent).toContain('Shop yêu thích');
    expect(nearby[1].querySelector('app-salon-subscription-badge')).toBeNull();
  });
});

describe('Live public salon plan pricing', () => {
  const api = { plans: vi.fn() };
  let fixture: ComponentFixture<SalonPlansComponent | ForBusiness> | undefined;
  const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); fixture!.detectChanges(); };
  const render = () => { const current = TestBed.createComponent(SalonPlansComponent); fixture = current; current.detectChanges(); return current.componentInstance; };
  beforeEach(() => {
    vi.resetAllMocks(); api.plans.mockResolvedValue(configuredPlans);
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: SubscriptionApiService, useValue: api }] });
  });
  afterEach(() => { fixture?.destroy(); fixture = undefined; TestBed.resetTestingModule(); });

  it('shows a loading state before catalog data arrives without displaying a guessed price', async () => {
    let resolve!: (plans: SubscriptionPlan[]) => void;
    api.plans.mockReturnValueOnce(new Promise(value => { resolve = value; }));
    const component = render();
    expect(component.loading()).toBe(true); expect(fixture!.nativeElement.textContent).toContain('Đang tải giá');
    expect(fixture!.nativeElement.querySelectorAll('.plan__price strong')).toHaveLength(0);
    resolve(configuredPlans); await settle();
    expect(component.loading()).toBe(false); expect(api.plans).toHaveBeenCalledOnce();
  });

  it('displays unconfigured plans as unavailable with no numeric amount or invented free trial', async () => {
    api.plans.mockResolvedValueOnce(unconfiguredPlans); render(); await settle();
    const root = fixture!.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.plan')).toHaveLength(2); expect(root.querySelectorAll('.plan__price strong')).toHaveLength(0);
    expect(root.textContent).toContain('Giá đang được cập nhật');
    expect(Array.from(root.querySelectorAll('.plan__availability')).map(node => node.textContent?.trim())).toEqual(['Chưa mở đăng ký', 'Chưa mở đăng ký']);
    expect(root.textContent).not.toContain('miễn phí 1 tháng');
  });

  it('displays exact backend prices and explains transfer-first activation and tier priority', async () => {
    render(); await settle(); const root = fixture!.nativeElement as HTMLElement;
    const prices = Array.from(root.querySelectorAll('.plan__price strong')).map(node => node.textContent?.replace(/[^0-9]/g, ''));
    expect(prices).toEqual(['127000', '347000']);
    expect(Array.from(root.querySelectorAll('.plan__availability')).every(node => node.textContent?.includes('Đang nhận đăng ký'))).toBe(true);
    expect(root.textContent?.toLowerCase()).toContain('chuyển khoản'); expect(root.textContent?.toLowerCase()).toContain('nhận tiền');
    expect(root.textContent).toContain('Hiển thị trước gói Thường');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/business-registration');
  });

  it('keeps a configured but disabled plan closed while preserving its displayed server price', async () => {
    api.plans.mockResolvedValueOnce(configuredPlans.map(plan => ({ ...plan, enabled: false, registrationAvailable: false }))); render(); await settle();
    const root = fixture!.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.plan__price strong')).toHaveLength(2);
    expect(Array.from(root.querySelectorAll('.plan__availability')).every(node => node.textContent?.includes('Chưa mở đăng ký'))).toBe(true);
  });

  it('does not advertise a legacy enabled zero-price catalog entry as available for bank-transfer registration', async () => {
    api.plans.mockResolvedValueOnce(configuredPlans.map(plan => ({ ...plan, monthlyPrice: 0, enabled: true, registrationAvailable: false }))); render(); await settle();
    const root = fixture!.nativeElement as HTMLElement;
    expect(Array.from(root.querySelectorAll('.plan__price strong')).map(node => node.textContent?.trim())).toEqual(['0', '0']);
    expect(Array.from(root.querySelectorAll('.plan__availability')).every(node => node.textContent?.includes('Chưa mở đăng ký'))).toBe(true);
  });

  it('uses server registration readiness rather than the raw enabled flag when banking instructions are unavailable', async () => {
    api.plans.mockResolvedValueOnce(configuredPlans.map(plan => ({ ...plan, enabled: true, registrationAvailable: false }))); render(); await settle();
    const root = fixture!.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.plan__price strong')).toHaveLength(2);
    expect(Array.from(root.querySelectorAll('.plan__availability')).every(node => node.textContent?.includes('Chưa mở đăng ký'))).toBe(true);
  });

  it('allows retry after a catalog failure and never substitutes demo prices', async () => {
    api.plans.mockRejectedValueOnce(new Error('offline')); render(); await settle();
    const root = fixture!.nativeElement as HTMLElement;
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Chưa tải được giá gói');
    expect(root.querySelectorAll('.plan__price strong')).toHaveLength(0);
    root.querySelector<HTMLButtonElement>('[role="alert"] button')!.click(); await settle();
    expect(api.plans).toHaveBeenCalledTimes(2); expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelectorAll('.plan__price strong')).toHaveLength(2);
  });

  it('discards catalog data arriving after the public pricing view is destroyed', async () => {
    let resolve!: (plans: SubscriptionPlan[]) => void;
    api.plans.mockReturnValueOnce(new Promise(value => { resolve = value; }));
    const component = render(); fixture!.destroy(); fixture = undefined;
    resolve(configuredPlans); await Promise.resolve(); await Promise.resolve(); expect(component.plans()).toEqual([]);
  });

  it('mounts the actual live pricing section in ForBusiness and removes the previous free-month promise', async () => {
    fixture = TestBed.createComponent(ForBusiness); fixture.detectChanges(); await settle();
    const root = fixture.nativeElement as HTMLElement;
    expect(api.plans).toHaveBeenCalledOnce(); expect(root.querySelector('app-salon-plans')).not.toBeNull();
    expect(root.querySelectorAll('.plan__price strong')).toHaveLength(2); expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.textContent).not.toContain('miễn phí 1 tháng');
  });
});
