import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiConfig } from '../config/api.config';
import { Salon, Service, Staff, Review } from '../models/ellora.model';
interface SalonResponse {id:number;name:string;description?:string;address:string;city:string;district?:string|null;logoUrl?:string;imageUrls?:string[];averageRating:number;totalReviews:number;latitude?:number|null;longitude?:number|null;distanceKm?:number|null;subscriptionTier?:string|null;subscriptionBadge?:string|null;}
export interface SalonSearchOptions { keyword?:string;location?:string;date?:string;time?:string;latitude?:number;longitude?:number;radiusKm?:number;sort?:'newest'|'rating'|'distance'; }
export interface SalonPage<T> {content:T[];pageNumber:number;last:boolean;totalElements:number;}
export interface SalonWorkingHour { dayOfWeek: string; openTime: string | null; closeTime: string | null; closed: boolean; }
@Injectable({providedIn:'root'})
export class SalonApiService {
 private http=inject(HttpClient); private base=apiConfig.baseUrl+'/customer/salons';
 private async get<T>(path:string){return (await firstValueFrom(this.http.get<{data:T}>(this.base+path))).data;}
 private map(s:SalonResponse):Salon{
  const images=[...new Set([...(s.logoUrl?[s.logoUrl]:[]),...(s.imageUrls||[])])];
  const {latitude,longitude}=s;
  const coordinates=typeof latitude==='number'&&typeof longitude==='number'&&Number.isFinite(latitude)&&Number.isFinite(longitude)
   &&latitude>=-90&&latitude<=90&&longitude>=-180&&longitude<=180?{lat:latitude,lng:longitude}:null;
  const distance=coordinates&&typeof s.distanceKm==='number'&&Number.isFinite(s.distanceKm)&&s.distanceKm>=0?s.distanceKm:undefined;
  const subscriptionTier=s.subscriptionTier==='VIP'||s.subscriptionTier==='STANDARD'?s.subscriptionTier:null;
  const subscriptionBadge=subscriptionTier==='VIP'?'Shop đối tác':subscriptionTier==='STANDARD'?'Shop yêu thích':null;
  return {id:String(s.id),name:s.name,description:s.description||'',address:s.address,city:s.city,district:s.district,rating:s.averageRating||0,reviewCount:s.totalReviews||0,images:images.length?images:['/salon-placeholder.svg'],coordinates,distance,subscriptionTier,subscriptionBadge};
 }
 async search(keyword='',page=0,size=12){const result=await this.get<SalonPage<SalonResponse>>('?keyword='+encodeURIComponent(keyword)+'&page='+page+'&size='+size);return {...result,content:result.content.map(s=>this.map(s))};}
 async searchFiltered(options:SalonSearchOptions={},page=0,size=12){
  let params=new HttpParams().set('page',page).set('size',size);
  for(const [key,value] of Object.entries(options)){if(value!==undefined&&value!==null&&value!=='')params=params.set(key,String(value));}
  const result=(await firstValueFrom(this.http.get<{data:SalonPage<SalonResponse>}>(this.base,{params,transferCache:options.latitude===undefined&&options.longitude===undefined}))).data;
  return {...result,content:result.content.map(s=>this.map(s))};
 }
 async detail(id:string){return this.map(await this.get<SalonResponse>('/'+encodeURIComponent(id)));}
 async workingHours(id:string):Promise<SalonWorkingHour[]>{return this.get('/'+encodeURIComponent(id)+'/working-hours');}
 async closedDates(id:string,from:string,to:string):Promise<string[]>{return this.get('/'+encodeURIComponent(id)+'/closures?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to));}
 async services(id:string):Promise<Service[]>{const list=await this.get<{id:number;name:string;description:string;price:number;durationMinutes:number;categoryId?:number;imageUrl?:string}[]>('/'+encodeURIComponent(id)+'/services');return list.map(s=>({...s,id:String(s.id),salonId:id,categoryId:s.categoryId?String(s.categoryId):undefined}));}
 async employees(id:string):Promise<Staff[]>{const list=await this.get<{id:number;fullName:string;bio:string;avatarUrl?:string}[]>('/'+encodeURIComponent(id)+'/employees');return list.map(s=>({id:String(s.id),salonId:id,name:s.fullName,role:s.bio||'Nhân viên',avatar:s.avatarUrl}));}
 async reviews(id:string,page=0){const result=await this.get<SalonPage<{id:number;customerName:string;rating:number;comment:string;createdAt:string;salonReply?:string;salonRepliedAt?:string}>>('/'+encodeURIComponent(id)+'/reviews?page='+page);return {...result,content:result.content.map(s=>({id:String(s.id),salonId:id,authorId:'',authorName:s.customerName,rating:s.rating,comment:s.comment,date:s.createdAt,salonReply:s.salonReply,salonRepliedAt:s.salonRepliedAt} as Review))};}
}
