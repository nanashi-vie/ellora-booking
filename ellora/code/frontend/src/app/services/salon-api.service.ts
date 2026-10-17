import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiConfig } from '../config/api.config';
import { Salon, Service, Staff, Review } from '../models/ellora.model';
interface SalonResponse {id:number;name:string;description?:string;address:string;city:string;logoUrl?:string;imageUrls?:string[];averageRating:number;totalReviews:number;latitude?:number;longitude?:number;}
export interface SalonPage<T> {content:T[];pageNumber:number;last:boolean;totalElements:number;}
export interface SalonWorkingHour { dayOfWeek: string; openTime: string | null; closeTime: string | null; closed: boolean; }
@Injectable({providedIn:'root'})
export class SalonApiService {
 private http=inject(HttpClient); private base=apiConfig.baseUrl+'/customer/salons';
 private async get<T>(path:string){return (await firstValueFrom(this.http.get<{data:T}>(this.base+path))).data;}
 private map(s:SalonResponse):Salon{const images=[...new Set([...(s.logoUrl?[s.logoUrl]:[]),...(s.imageUrls||[])])];return {id:String(s.id),name:s.name,description:s.description||'',address:s.address,city:s.city,rating:s.averageRating||0,reviewCount:s.totalReviews||0,images:images.length?images:['/salon-placeholder.svg'],coordinates:{lat:s.latitude??0,lng:s.longitude??0}};}
 async search(keyword='',page=0,size=12){const result=await this.get<SalonPage<SalonResponse>>('?keyword='+encodeURIComponent(keyword)+'&page='+page+'&size='+size);return {...result,content:result.content.map(s=>this.map(s))};}
 async detail(id:string){return this.map(await this.get<SalonResponse>('/'+encodeURIComponent(id)));}
 async workingHours(id:string):Promise<SalonWorkingHour[]>{return this.get('/'+encodeURIComponent(id)+'/working-hours');}
 async closedDates(id:string,from:string,to:string):Promise<string[]>{return this.get('/'+encodeURIComponent(id)+'/closures?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to));}
 async services(id:string):Promise<Service[]>{const list=await this.get<{id:number;name:string;description:string;price:number;durationMinutes:number;categoryId?:number;imageUrl?:string}[]>('/'+encodeURIComponent(id)+'/services');return list.map(s=>({...s,id:String(s.id),salonId:id,categoryId:s.categoryId?String(s.categoryId):undefined}));}
 async employees(id:string):Promise<Staff[]>{const list=await this.get<{id:number;fullName:string;bio:string;avatarUrl?:string}[]>('/'+encodeURIComponent(id)+'/employees');return list.map(s=>({id:String(s.id),salonId:id,name:s.fullName,role:s.bio||'Nhân viên',avatar:s.avatarUrl}));}
 async reviews(id:string,page=0){const result=await this.get<SalonPage<{id:number;customerName:string;rating:number;comment:string;createdAt:string;salonReply?:string;salonRepliedAt?:string}>>('/'+encodeURIComponent(id)+'/reviews?page='+page);return {...result,content:result.content.map(s=>({id:String(s.id),salonId:id,authorId:'',authorName:s.customerName,rating:s.rating,comment:s.comment,date:s.createdAt,salonReply:s.salonReply,salonRepliedAt:s.salonRepliedAt} as Review))};}
}
