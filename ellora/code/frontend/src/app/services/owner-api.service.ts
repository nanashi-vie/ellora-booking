import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiConfig } from '../config/api.config';
import { SalonRegistration, SalonProfileChange } from './salon-registration.service';

export interface OwnerService {
  imageUrl?: string;
  categoryId?: number | null;
  id: number;
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  active: boolean;
}
export interface OwnerEmployee {
  avatarUrl?: string;
  id: number;
  fullName: string;
  phone: string;
  bio: string;
  active: boolean;
}
export interface OwnerEmployeeSchedule { dayOfWeek: string; startTime: string; endTime: string; available: boolean; }
export interface OwnerReview {
  id: number;
  customerName: string;
  employeeName?: string | null;
  employeeAvatarUrl?: string | null;
  rating: number;
  comment: string;
  salonReply: string;
  salonRepliedAt?: string;
  createdAt: string;
}
export interface OwnerSummary {
  totalBookings: number;
  pendingBookings: number;
  confirmedBookings: number;
  completedBookings: number;
  monthlyRevenue?: number;
  monthlyCustomers?: number;
  averageRating?: number;
}
export interface OwnerRevenuePoint { date: string; gross: number; fee: number; net: number; bookings: number; }
export interface OwnerRevenueReport {
  gross: number; fee: number; net: number; completedBookings: number; estimatedBookings: number;
  points: OwnerRevenuePoint[];
}
export interface OwnerWorkingHour { dayOfWeek: string; openTime: string | null; closeTime: string | null; closed: boolean; }
export interface OwnerClosure { id: number; date: string; reason: string; }
export interface OwnerPage<T> {
  content: T[];
  pageNumber: number;
  totalElements: number;
  last: boolean;
}

export function ownerError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Không kết nối được backend. Vui lòng thử lại.';
    if (error.status === 403) return 'Bạn không có quyền thao tác với dữ liệu này.';
    if (error.status === 409 && typeof error.error?.message === 'string') return error.error.message;
    if (error.status === 400) return 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra các trường đã nhập.';
  }
  return 'Không thực hiện được thao tác. Vui lòng thử lại.';
}

@Injectable({ providedIn: 'root' })
export class OwnerApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${apiConfig.baseUrl}/owner`;
  private async get<T>(path: string): Promise<T> {
    return (await firstValueFrom(this.http.get<{ data: T }>(`${this.base}/${path}`))).data;
  }
  async uploadPhoto(
    kind: 'cover' | 'gallery' | 'services' | 'employees',
    id: number,
    file: File,
  ): Promise<string> {
    const data = new FormData();
    data.append('file', file);
    return (
      await firstValueFrom(
        this.http.post<{ data: string }>(this.base + '/photos/' + kind + '/' + id, data),
      )
    ).data;
  }
  async uploadGallery(id: number, files: File[]): Promise<string[]> {
    const data = new FormData();
    files.forEach(file => data.append('files', file));
    return (await firstValueFrom(this.http.post<{ data: string[] }>(`${this.base}/photos/gallery/${id}/batch`, data))).data;
  }
  async removeGallery(url: string) {
    await firstValueFrom(this.http.delete(this.base + '/photos/gallery', { params: { url } }));
  }
  async removePhoto(kind: 'cover' | 'services' | 'employees', id: number) {
    await firstValueFrom(this.http.delete(`${this.base}/photos/${kind}/${id}`));
  }
  salon() {
    return this.get<SalonRegistration>('salon');
  }
  workingHours() { return this.get<OwnerWorkingHour[]>('salon/working-hours'); }
  async saveWorkingHours(hours: OwnerWorkingHour[]) {
    return (await firstValueFrom(this.http.put<{data:OwnerWorkingHour[]}>(`${this.base}/salon/working-hours`,hours))).data;
  }
  closures() { return this.get<OwnerClosure[]>('salon/closures'); }
  async closeDate(date: string, reason: string) {
    return (await firstValueFrom(this.http.post<{ data: OwnerClosure }>(`${this.base}/salon/closures`, { date, reason }))).data;
  }
  async reopenDate(id: number) { await firstValueFrom(this.http.delete(`${this.base}/salon/closures/${id}`)); }
  async saveSalon(data: {name:string;description:string;address:string;city:string;district:string;phone:string;email:string;latitude?:number|null;longitude?:number|null}) {
    return (await firstValueFrom(this.http.put<{data:SalonProfileChange}>(`${this.base}/salon`,data))).data;
  }
  salonChange() { return this.get<SalonProfileChange|null>('salon/change-request'); }
  summary() {
    return this.get<OwnerSummary>('dashboard');
  }
  revenue(from: string, to: string, groupBy: 'day' | 'week' | 'month' | 'year' = 'day') {
    return firstValueFrom(this.http.get<{ data: OwnerRevenueReport }>(`${this.base}/revenue`, { params: { from, to, groupBy } }))
      .then(response => response.data);
  }
  services() {
    return this.get<OwnerService[]>('services');
  }
  employees() {
    return this.get<OwnerEmployee[]>('employees');
  }
  employeeSchedules(id: number) {
    return this.get<OwnerEmployeeSchedule[]>(`employees/${id}/schedules`);
  }
  reviews(page = 0) {
    return this.get<OwnerPage<OwnerReview>>(`reviews?page=${page}`);
  }
  async saveService(
    data: {
      name: string;
      description: string;
      price: number;
      durationMinutes: number;
      categoryId?: number | null;
    },
    id?: number,
  ) {
    const url = `${this.base}/services${id === undefined ? '' : '/' + id}`;
    await firstValueFrom(id === undefined ? this.http.post(url, data) : this.http.put(url, data));
  }
  async saveEmployee(data: { fullName: string; phone: string; bio: string }, id?: number) {
    const url = `${this.base}/employees${id === undefined ? '' : '/' + id}`;
    await firstValueFrom(id === undefined ? this.http.post(url, data) : this.http.put(url, data));
  }
  async remove(kind: 'services' | 'employees', id: number) {
    await firstValueFrom(this.http.delete(`${this.base}/${kind}/${id}`));
  }
  async reply(id: number, reply: string) {
    await firstValueFrom(this.http.post(`${this.base}/reviews/${id}/reply`, { reply }));
  }
}
