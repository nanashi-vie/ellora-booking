import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { RouterTestingHarness } from '@angular/router/testing';
import { RouterOutlet, Routes } from '@angular/router';
import { routes } from '../app.routes';
import { ActivatedRouteSnapshot, RouterStateSnapshot, Router, provideRouter, convertToParamMap } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ProfileApiService, Profile } from '../services/profile-api.service';
import { roleGuard, roleHome, nonOwnerGuard } from './role.guard';

@Component({standalone:true,imports:[RouterOutlet],template:'<router-outlet />'})
class RouteStub {}
function stubRoutes(items:Routes):Routes {
  return items.map(({loadComponent,children,...route})=>({...route,
    ...(loadComponent?{component:RouteStub}:{}),...(children?{children:stubRoutes(children)}:{})}));
}

describe('Role routes', () => {
  let role: Profile['role'];
  let authenticated: boolean;
  beforeEach(() => {
    role = 'CUSTOMER'; authenticated = true;
    TestBed.configureTestingModule({ providers: [provideRouter([]),
      { provide: AuthService, useValue: { isAuthenticated: async () => authenticated } },
      { provide: ProfileApiService, useValue: { getCurrentUser: async () => ({ role }) } },
    ] });
  });
  const check = (requiredRole: string, child = false) => TestBed.runInInjectionContext(() => roleGuard(
    (child ? { data: {}, parent: { data: { role: requiredRole } } } : { data: { role: requiredRole } }) as unknown as ActivatedRouteSnapshot,
    {} as RouterStateSnapshot));
  it('blocks customers from owner and admin routes', async () => {
    expect(TestBed.inject(Router).serializeUrl(await check('SALON_OWNER') as any)).toBe('/');
    expect(TestBed.inject(Router).serializeUrl(await check('ADMIN') as any)).toBe('/');
  });
  it('allows approved owners including child routes, but not admin routes', async () => {
    role = 'SALON_OWNER';
    expect(await check('SALON_OWNER')).toBe(true);
    expect(await check('SALON_OWNER', true)).toBe(true);
    expect(await check('ADMIN')).not.toBe(true);
  });
  it('allows admins and redirects logged-out users to login', async () => {
    role = 'ADMIN'; expect(await check('ADMIN')).toBe(true);
    authenticated = false;
    expect(TestBed.inject(Router).serializeUrl(await check('ADMIN') as any)).toBe('/login');
  });
  it('chooses login destinations for all roles', () => {
    expect(roleHome('ADMIN')).toBe('/admin/dashboard');
    expect(roleHome('SALON_OWNER')).toBe('/owner/dashboard');
    expect(roleHome('CUSTOMER')).toBe('/');
  });
  const customerPage = (url: string, callback=false) => TestBed.runInInjectionContext(() => nonOwnerGuard(
    {data:{},routeConfig:{path:url.slice(1)},queryParamMap:convertToParamMap(callback?{code:'test-code'}:{})} as ActivatedRouteSnapshot,
    {url} as RouterStateSnapshot));
  it('redirects authenticated owners from customer pages and login to management', async () => {
    role='SALON_OWNER';
    for (const url of ['/','/search','/booking','/my-bookings','/profile','/login','/register']) {
      expect(TestBed.inject(Router).serializeUrl(await customerPage(url) as any)).toBe('/owner/dashboard');
    }
  });
  it('allows customer browsing and signed-out login, and lets OAuth complete',async()=>{
    expect(await customerPage('/search')).toBe(true);
    authenticated=false;expect(await customerPage('/login')).toBe(true);
    authenticated=true;role='SALON_OWNER';expect(await customerPage('/login',true)).toBe(true);
  });
  it('resolves /owner and redirects direct customer URLs without a navigation loop',async()=>{
    role='SALON_OWNER';TestBed.inject(Router).resetConfig(stubRoutes(routes));
    const harness=await RouterTestingHarness.create();
    for(const url of ['/owner','/','/search','/salon/1','/booking','/setting/my-bookings','/login','/register','/forgot-password','/admin/users']) {
      await harness.navigateByUrl(url);
      expect(TestBed.inject(Router).url).toBe('/owner/dashboard');
    }
    await harness.navigateByUrl('/owner/profile');expect(TestBed.inject(Router).url).toBe('/owner/profile');
  });
  it('blocks admins from booking and business registration while allowing customers',async()=>{
    TestBed.inject(Router).resetConfig(stubRoutes(routes));
    const harness=await RouterTestingHarness.create();
    role='ADMIN';
    for(const url of ['/booking','/business-registration']) {
      await harness.navigateByUrl(url);expect(TestBed.inject(Router).url).toBe('/admin/dashboard');
    }
    role='CUSTOMER';
    for(const url of ['/booking','/business-registration']) {
      await harness.navigateByUrl(url);expect(TestBed.inject(Router).url).toBe(url);
    }
  });
  it('protects admin sections and allows administrators',async()=>{
    TestBed.inject(Router).resetConfig(stubRoutes(routes));
    const harness=await RouterTestingHarness.create();role='ADMIN';
    for(const section of ['users','approvals','content','billing']) {
      await harness.navigateByUrl('/admin/'+section);
      expect(TestBed.inject(Router).url).toBe('/admin/'+section);
    }
    role='CUSTOMER';
    await harness.navigateByUrl('/admin/users');expect(TestBed.inject(Router).url).toBe('/');
  });

  it('allows anonymous booking while account history and business registration still require login', async () => {
    authenticated = false;
    TestBed.inject(Router).resetConfig(stubRoutes(routes));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/booking?salonId=1&serviceId=2');
    expect(TestBed.inject(Router).url).toBe('/booking?salonId=1&serviceId=2');
    for (const url of ['/setting/my-bookings', '/business-registration']) {
      await harness.navigateByUrl(url);
      expect(TestBed.inject(Router).url).toBe('/login');
    }
  });
});
