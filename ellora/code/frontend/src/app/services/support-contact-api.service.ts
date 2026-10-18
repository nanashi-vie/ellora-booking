import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiConfig } from '../config/api.config';

export interface SupportContact {
  email: string;
  phone: string;
  facebookUrl: string;
}

@Injectable({ providedIn: 'root' })
export class SupportContactApiService {
  private readonly http = inject(HttpClient);
  private readonly base = apiConfig.baseUrl;

  async get() {
    return (await firstValueFrom(this.http.get<{ data: SupportContact }>(`${this.base}/support/contact`))).data;
  }

  async update(contact: SupportContact) {
    return (await firstValueFrom(this.http.put<{ data: SupportContact }>(`${this.base}/admin/support/contact`, contact))).data;
  }
}
