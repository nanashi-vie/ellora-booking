import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';
import { apiConfig } from '../config/api.config';

describe('API authentication cost', () => {
  const auth = { getAccessToken: vi.fn() };
  let http: HttpClient;
  let requests: HttpTestingController;
  beforeEach(() => {
    auth.getAccessToken.mockReset().mockResolvedValue('test-token');
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
      { provide: AuthService, useValue: auth },
    ] });
    http = TestBed.inject(HttpClient); requests = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { requests.verify(); TestBed.resetTestingModule(); });

  it('starts public reads immediately without looking up a token', async () => {
    // A pending auth lookup must never block these public endpoints.
    auth.getAccessToken.mockReturnValue(new Promise(() => {}));
    for (const path of ['/customer/salons?size=12', '/customer/salons/1/services', '/ping']) {
      const result = firstValueFrom(http.get(apiConfig.baseUrl + path));
      const request = requests.expectOne(apiConfig.baseUrl + path);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({}); await result;
    }
    expect(auth.getAccessToken).not.toHaveBeenCalled();
  });

  it('preserves authentication for protected paths and non-GET requests', async () => {
    for (const path of ['/owner/salon', '/profiles/me', '/bookings/my', '/customer/salons-private']) {
      const result = firstValueFrom(http.get(apiConfig.baseUrl + path));
      await Promise.resolve();
      const request = requests.expectOne(apiConfig.baseUrl + path);
      expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
      request.flush({}); await result;
    }
    const result = firstValueFrom(http.post(apiConfig.baseUrl + '/customer/salons', {}));
    await Promise.resolve();
    const request = requests.expectOne(apiConfig.baseUrl + '/customer/salons');
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
    request.flush({}); await result;
  });

  it('sends the guest endpoint with the customer access token', async () => {
    auth.getAccessToken.mockResolvedValue('test-token');
    const result = firstValueFrom(http.post(apiConfig.baseUrl + '/bookings/guest', { email: 'mai@example.com' }));
    await Promise.resolve();
    const request = requests.expectOne(apiConfig.baseUrl + '/bookings/guest');
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
    expect(auth.getAccessToken).toHaveBeenCalledOnce();
    request.flush({}); await result;
  });

  it('keeps regular booking writes and guest lookalike paths authenticated', async () => {
    for (const path of ['/bookings', '/bookings/guest-other', '/bookings/guest/1']) {
      const result = firstValueFrom(http.post(apiConfig.baseUrl + path, {}));
      await Promise.resolve();
      const request = requests.expectOne(apiConfig.baseUrl + path);
      expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
      request.flush({}); await result;
    }
    const result = firstValueFrom(http.get(apiConfig.baseUrl + '/bookings/guest'));
    await Promise.resolve();
    const request = requests.expectOne(apiConfig.baseUrl + '/bookings/guest');
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
    request.flush({}); await result;
  });

  it('does not send credentials to an external site', async () => {
    const result = firstValueFrom(http.get('https://example.com/data'));
    const request = requests.expectOne('https://example.com/data');
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(auth.getAccessToken).not.toHaveBeenCalled();
    request.flush({}); await result;
  });
});
