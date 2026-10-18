import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { apiConfig } from '../config/api.config';

export type SalonPlanTier = 'STANDARD' | 'VIP';
export type SubscriptionRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export interface SubscriptionPlan {
  tier: SalonPlanTier; displayName: string; badgeLabel: string; monthlyPrice: number | null;
  currency: 'VND'; enabled: boolean; termMonths: 1; registrationAvailable: boolean;
}
export interface SubscriptionRequest {
  id: number; salonId: number; salonName: string; tier: SalonPlanTier; quotedPrice: number;
  status: SubscriptionRequestStatus; createdAt: string; reviewedAt: string | null; reviewNote: string | null;
  startsAt: string | null; expiresAt: string | null;
  paymentQrUrl: string | null; transferContent: string; paymentReportedAt: string | null; paymentReference: string | null;
  paymentConfirmedAt: string | null; receivedAmount: number | null;
}
export interface OwnerSubscription {
  salonId: number; effectiveTier: SalonPlanTier | null; badgeLabel: string | null;
  startsAt: string | null; expiresAt: string | null; pendingRequest: SubscriptionRequest | null;
}
export interface SubscriptionRequestPage {
  content: SubscriptionRequest[]; pageNumber: number; totalElements: number; last: boolean;
}

@Injectable({ providedIn: 'root' })
export class SubscriptionApiService {
  private readonly http = inject(HttpClient);
  private readonly base = apiConfig.baseUrl;
  private async get<T>(path: string, params?: HttpParams): Promise<T> {
    return (await firstValueFrom(this.http.get<{ data: T }>(this.base + path, { params }))).data;
  }
  plans(): Promise<SubscriptionPlan[]> { return this.get('/salon-plans'); }
  owner(): Promise<OwnerSubscription> { return this.get('/owner/subscription'); }
  ownerRequests(page = 0): Promise<SubscriptionRequestPage> {
    return this.get('/owner/subscription/requests', new HttpParams().set('page', page).set('size', 20));
  }
  async request(tier: SalonPlanTier, expectedPrice: number): Promise<SubscriptionRequest> {
    return (await firstValueFrom(this.http.post<{ data: SubscriptionRequest }>(this.base + '/owner/subscription/requests', { tier, expectedPrice }))).data;
  }
  async preparePayment(id: number): Promise<SubscriptionRequest> {
    return (await firstValueFrom(this.http.post<{ data: SubscriptionRequest }>(`${this.base}/owner/subscription/requests/${id}/prepare-payment`, {}))).data;
  }
  async reportPayment(id: number, value: { reference?: string }): Promise<SubscriptionRequest> {
    return (await firstValueFrom(this.http.post<{ data: SubscriptionRequest }>(`${this.base}/owner/subscription/requests/${id}/payment`, value))).data;
  }
  adminPlans(): Promise<SubscriptionPlan[]> { return this.get('/admin/subscription-plans'); }
  async savePlan(tier: SalonPlanTier, value: { monthlyPrice: number | null; enabled: boolean }): Promise<SubscriptionPlan> {
    return (await firstValueFrom(this.http.put<{ data: SubscriptionPlan }>(`${this.base}/admin/subscription-plans/${tier}`, value))).data;
  }
  adminRequests(status: SubscriptionRequestStatus | '' = 'PENDING', page = 0): Promise<SubscriptionRequestPage> {
    let params = new HttpParams().set('page', page).set('size', 20);
    if (status) params = params.set('status', status);
    return this.get('/admin/subscription-requests', params);
  }
  async decide(id: number, value: { status: 'APPROVED' | 'REJECTED'; note?: string; paymentReceived?: boolean; expectedAmount?: number }): Promise<SubscriptionRequest> {
    return (await firstValueFrom(this.http.patch<{ data: SubscriptionRequest }>(`${this.base}/admin/subscription-requests/${id}`, value))).data;
  }
}
