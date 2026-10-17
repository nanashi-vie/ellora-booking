import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { apiConfig } from '../config/api.config';

// ─── Request / Response models (khớp với backend) ───────────────────────────

export interface BookingCreateRequest {
  salonId: number;
  serviceId: number;
  employeeId?: number;        // optional — null = "bất kỳ thợ nào"
  scheduledAt: string;        // ISO-8601, e.g. "2026-10-15T09:00:00"
  customerNote?: string;
  customerPhone?: string;
}

export interface BookingStatusUpdateRequest {
  status: BookingStatus;
  salonNote?: string;
}

export interface WalkInBookingRequest {
  serviceId: number; employeeId?: number; scheduledAt: string;
  customerName?: string; customerPhone?: string; customerNote?: string;
}

export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED';

export type CompletionConfirmation = 'PENDING' | 'CONFIRMED' | 'DISPUTED' | 'ADMIN_CONFIRMED' | 'REOPENED';

export interface BookingItem {
  id: number;
  salonId: number;
  salonName: string;
  salonLogoUrl?: string | null;
  customerName: string;
  customerPhone?: string | null;
  walkIn?: boolean;
  serviceId: number;
  serviceName: string;
  servicePrice: number;
  employeeId?: number;
  employeeName?: string;
  scheduledAt: string;        // ISO-8601 LocalDateTime
  durationMinutes: number;
  status: BookingStatus;
  customerNote?: string;
  reviewed?: boolean;
  reviewRating?: number | null;
  salonNote?: string;
  cancellationReason?: string;
  createdAt: string;
  completionConfirmation?: CompletionConfirmation | null;
  completionVersion?: number;
  completionRespondedAt?: string | null;
  completionCustomerNote?: string | null;
  completionAdminNote?: string | null;
  completionResolvedAt?: string | null;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

interface PageResponse<T> {
  content: T[];
  pageNumber: number;
  pageSize: number;
  totalElements: number;
  totalPages: number;
  last: boolean;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable({
  providedIn: 'root',
})
export class BookingApiService {
  private readonly http = inject(HttpClient);
  private readonly base = apiConfig.baseUrl;

  async reviewBooking(bookingId: number, rating: number, comment: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/reviews`, { bookingId, rating, comment }));
  }

  // ── CUSTOMER ──────────────────────────────────────────────────────────────

  /** Tạo booking mới (customer) */
  async createBooking(request: BookingCreateRequest): Promise<BookingItem> {
    const res = await firstValueFrom(
      this.http.post<ApiResponse<BookingItem>>(`${this.base}/bookings`, request)
    );
    return res.data;
  }

  /** Lấy danh sách booking của tôi (customer) */
  async getMyBookings(page = 0, size = 10): Promise<PageResponse<BookingItem>> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);
    const res = await firstValueFrom(
      this.http.get<ApiResponse<PageResponse<BookingItem>>>(`${this.base}/bookings/my`, { params })
    );
    return res.data;
  }

  async respondToCompletion(id: number, response: { completed: boolean; completionVersion: number; reason?: string }): Promise<BookingItem> {
    return (await firstValueFrom(this.http.post<ApiResponse<BookingItem>>(
      `${this.base}/bookings/${id}/completion-response`, response
    ))).data;
  }

  /** Hủy booking (customer) */
  async cancelBooking(id: number): Promise<void> {
    await firstValueFrom(
      this.http.delete<ApiResponse<void>>(`${this.base}/bookings/${id}`)
    );
  }

  // ── OWNER ─────────────────────────────────────────────────────────────────

  async createWalkIn(request: WalkInBookingRequest): Promise<BookingItem> {
    return (await firstValueFrom(this.http.post<ApiResponse<BookingItem>>(`${this.base}/owner/bookings/walk-ins`, request))).data;
  }

  /** Lấy danh sách booking của salon (owner) */
  async getSalonBookings(
    salonId: number,
    status?: BookingStatus,
    page = 0,
    size = 50
  ): Promise<PageResponse<BookingItem>> {
    let params = new HttpParams()
      .set('salonId', salonId)
      .set('page', page)
      .set('size', size);
    if (status) params = params.set('status', status);

    const res = await firstValueFrom(
      this.http.get<ApiResponse<PageResponse<BookingItem>>>(`${this.base}/owner/bookings`, { params })
    );
    return res.data;
  }

  /** Cập nhật trạng thái booking (owner) */
  async updateBookingStatus(
    id: number,
    request: BookingStatusUpdateRequest
  ): Promise<BookingItem> {
    const res = await firstValueFrom(
      this.http.patch<ApiResponse<BookingItem>>(
        `${this.base}/owner/bookings/${id}/status`,
        request
      )
    );
    return res.data;
  }
}
