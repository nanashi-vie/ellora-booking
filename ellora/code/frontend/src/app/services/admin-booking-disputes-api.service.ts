import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { apiConfig } from '../config/api.config';
import { BookingStatus } from './booking-api.service';

export type BookingDisputeStatus = 'OPEN' | 'UPHELD' | 'REOPENED';
export type BookingDisputeOutcome = Exclude<BookingDisputeStatus, 'OPEN'>;
export interface AdminBookingDispute {
  id: number; bookingId: number; completionVersion: number; status: BookingDisputeStatus;
  reason: string; createdAt: string; resolvedAt: string | null; resolvedBy: string | null; adminNote: string | null;
  customerName: string; customerPhone: string | null; customerEmail: string | null;
  salonId: number; salonName: string; salonPhone: string | null; salonEmail: string | null; salonAddress: string | null;
  ownerName: string; ownerPhone: string | null; ownerEmail: string | null;
  serviceName: string; servicePrice: number; scheduledAt: string; durationMinutes: number;
  employeeName: string | null; bookingStatus: BookingStatus; completedAt: string | null;
}
export interface AdminBookingDisputePage {
  content: AdminBookingDispute[]; pageNumber: number; totalElements: number; last: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminBookingDisputesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${apiConfig.baseUrl}/admin/booking-disputes`;

  async list(status: BookingDisputeStatus | '' = 'OPEN', page = 0): Promise<AdminBookingDisputePage> {
    let params = new HttpParams().set('page', page).set('size', 20);
    if (status) params = params.set('status', status);
    return (await firstValueFrom(this.http.get<{ data: AdminBookingDisputePage }>(this.base, { params }))).data;
  }
  async detail(id: number): Promise<AdminBookingDispute> {
    return (await firstValueFrom(this.http.get<{ data: AdminBookingDispute }>(`${this.base}/${id}`))).data;
  }
  async resolve(id: number, outcome: BookingDisputeOutcome, note: string): Promise<AdminBookingDispute> {
    return (await firstValueFrom(this.http.patch<{ data: AdminBookingDispute }>(`${this.base}/${id}/resolution`, { outcome, note }))).data;
  }
}
