import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apiConfig } from '../config/api.config';
import { SubscriptionApiService } from './subscription-api.service';

describe('Subscription API contract', () => {
  let api: SubscriptionApiService; let http: HttpTestingController;
  beforeEach(() => { TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }); api = TestBed.inject(SubscriptionApiService); http = TestBed.inject(HttpTestingController); });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });
  it('reads the public catalog, owner state and paged owner history from envelopes', async () => {
    const plans = api.plans(); http.expectOne(apiConfig.baseUrl + '/salon-plans').flush({ data: [] }); expect(await plans).toEqual([]);
    const owner = api.owner(); http.expectOne(apiConfig.baseUrl + '/owner/subscription').flush({ data: { salonId: 7, effectiveTier: null } }); expect((await owner).salonId).toBe(7);
    const history = api.ownerRequests(2), request = http.expectOne(req => req.url === apiConfig.baseUrl + '/owner/subscription/requests');
    expect(request.request.params.get('page')).toBe('2'); expect(request.request.params.get('size')).toBe('20'); request.flush({ data: { content: [], pageNumber: 2 } }); expect((await history).pageNumber).toBe(2);
  });
  it('sends only the accepted tier and positive quote without client payment or period fields', async () => {
    const pending = api.request('STANDARD', 120000), request = http.expectOne(apiConfig.baseUrl + '/owner/subscription/requests');
    expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual({ tier: 'STANDARD', expectedPrice: 120000 });
    request.flush({ data: { id: 12, quotedPrice: 120000 } }); expect((await pending).quotedPrice).toBe(120000);
  });
  it('prepares legacy instructions, reports a transfer without asserting receipt, and sends explicit admin receipt fields', async () => {
    const prepare = api.preparePayment(12), instruction = http.expectOne(apiConfig.baseUrl + '/owner/subscription/requests/12/prepare-payment');
    expect(instruction.request.method).toBe('POST'); expect(instruction.request.body).toEqual({}); instruction.flush({ data: { id: 12 } }); await prepare;
    const report = api.reportPayment(12, { reference: 'GD123' }), declaration = http.expectOne(apiConfig.baseUrl + '/owner/subscription/requests/12/payment');
    expect(declaration.request.body).toEqual({ reference: 'GD123' }); declaration.flush({ data: { id: 12 } }); await report;
    const decide = api.decide(12, { status: 'APPROVED', paymentReceived: true, expectedAmount: 120000 }), receipt = http.expectOne(apiConfig.baseUrl + '/admin/subscription-requests/12');
    expect(receipt.request.body).toEqual({ status: 'APPROVED', paymentReceived: true, expectedAmount: 120000 }); receipt.flush({ data: { id: 12 } }); await decide;
  });
  it('uses protected admin catalog, nullable disabled prices, optional queue status and quoted decisions', async () => {
    const plans = api.adminPlans(); http.expectOne(apiConfig.baseUrl + '/admin/subscription-plans').flush({ data: [] }); await plans;
    const save = api.savePlan('VIP', { monthlyPrice: null, enabled: false }), put = http.expectOne(apiConfig.baseUrl + '/admin/subscription-plans/VIP');
    expect(put.request.method).toBe('PUT'); expect(put.request.body).toEqual({ monthlyPrice: null, enabled: false }); put.flush({ data: { tier: 'VIP' } }); await save;
    const queue = api.adminRequests('', 1), get = http.expectOne(req => req.url === apiConfig.baseUrl + '/admin/subscription-requests');
    expect(get.request.params.has('status')).toBe(false); expect(get.request.params.get('page')).toBe('1'); get.flush({ data: { content: [] } }); await queue;
    const decision = api.decide(12, { status: 'REJECTED', note: 'Cần trao đổi lại' }), patch = http.expectOne(apiConfig.baseUrl + '/admin/subscription-requests/12');
    expect(patch.request.method).toBe('PATCH'); expect(patch.request.body).toEqual({ status: 'REJECTED', note: 'Cần trao đổi lại' }); patch.flush({ data: { id: 12, status: 'REJECTED' } }); expect((await decision).status).toBe('REJECTED');
  });
});
