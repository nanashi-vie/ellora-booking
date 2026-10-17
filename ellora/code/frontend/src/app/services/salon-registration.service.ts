import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiConfig } from '../config/api.config';

export interface SalonRegistration {
  logoUrl?: string; imageUrls?: string[];
  id: number; name: string; address: string; city: string; district: string;
  phone: string | null; email: string | null; description: string | null;
  latitude?: number | null; longitude?: number | null;
  ownerName: string; ownerId: string;
  status: 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';
}
interface Response<T> { data: T; }
export type SalonProfileFields = Pick<SalonRegistration, 'name'|'description'|'address'|'city'|'district'|'phone'|'email'|'latitude'|'longitude'>;
export interface SalonProfileChange {
  id:number; salonId:number; salonName:string; current:SalonProfileFields; proposed:SalonProfileFields;
  status:'PENDING'|'APPROVED'|'REJECTED'; submittedAt:string; reviewedAt:string|null;
  kind:'PROFILE'|'COVER'|'GALLERY'; currentLogoUrl:string|null; proposedLogoUrl:string|null;
  currentImageUrls:string[]; proposedImageUrls:string[]|null;
}
export interface SalonChangePage {content:SalonProfileChange[]; last:boolean;}
export interface PendingPage { content: Pick<SalonRegistration, 'id' | 'name' | 'address' | 'city'>[]; last: boolean; }
@Injectable({ providedIn: 'root' })
export class SalonRegistrationService {
  private readonly http = inject(HttpClient);
  async changes(page:number) { return (await firstValueFrom(this.http.get<Response<SalonChangePage>>(`${apiConfig.baseUrl}/admin/salon-changes`,{params:{page}}))).data; }
  async decideChange(id:number,action:'approve'|'reject') { await firstValueFrom(this.http.post(`${apiConfig.baseUrl}/admin/salon-changes/${id}/${action}`,{})); }
  async mine() { return (await firstValueFrom(this.http.get<Response<SalonRegistration>>(`${apiConfig.baseUrl}/business/registration`))).data; }
  async register(request: { name: string; address: string; city: string; district: string; phone: string; email: string; description: string }) {
    return (await firstValueFrom(this.http.post<Response<SalonRegistration>>(`${apiConfig.baseUrl}/business/registration`, request))).data;
  }
  async pending(page: number) { return (await firstValueFrom(this.http.get<Response<PendingPage>>(`${apiConfig.baseUrl}/admin/salons/pending`, { params: { page } }))).data; }
  async detail(id: number) { return (await firstValueFrom(this.http.get<Response<SalonRegistration>>(`${apiConfig.baseUrl}/admin/salons/${id}`))).data; }
  async decide(id: number, action: 'approve' | 'reject') { await firstValueFrom(this.http.post(`${apiConfig.baseUrl}/admin/salons/${id}/${action}`, {})); }
}
