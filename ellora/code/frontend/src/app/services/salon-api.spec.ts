import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { SalonApiService } from './salon-api.service';
import { apiConfig } from '../config/api.config';
describe('Public salon API',()=>{
 let api:SalonApiService;let http:HttpTestingController;
 beforeEach(()=>{TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]});api=TestBed.inject(SalonApiService);http=TestBed.inject(HttpTestingController);});
 afterEach(()=>http.verify());
 it('preserves salon replies and their dates for customer display',async()=>{
  const result=api.reviews('1');
  http.expectOne(apiConfig.baseUrl+'/customer/salons/1/reviews?page=0').flush({data:{content:[{id:7,customerName:'Khách',rating:5,comment:'Tốt',createdAt:'2026-09-22T10:00:00',salonReply:'Cảm ơn bạn!',salonRepliedAt:'2026-09-22T11:00:00'}],last:true}});
  const review=(await result).content[0];
  expect(review.salonReply).toBe('Cảm ơn bạn!');expect(review.salonRepliedAt).toBe('2026-09-22T11:00:00');
 });
 it('maps actual DB IDs and missing images without invented ratings or availability',async()=>{
  const result=api.search('Salon thật',0,12);
  http.expectOne(r=>r.url.includes('/customer/salons?keyword=')).flush({data:{content:[{id:42,name:'Salon thật',address:'Quận 1',city:'HCM',averageRating:0,totalReviews:0}],last:true,totalElements:1,pageNumber:0}});
  const salon=(await result).content[0];expect(salon.id).toBe('42');expect(salon.images).toEqual(['/salon-placeholder.svg']);expect(salon.isOpen).toBeUndefined();expect(salon.reviewCount).toBe(0);expect(salon.coordinates).toBeNull();expect(salon.district).toBeUndefined();
 });
 it('preserves the approved district and coordinates from salon detail',async()=>{
  const result=api.detail('42');
  http.expectOne(apiConfig.baseUrl+'/customer/salons/42').flush({data:{id:42,name:'Tiệm Hoa',address:'12 Lê Lợi',district:'Quận 1',city:'Hồ Chí Minh',latitude:10.77,longitude:106.7,averageRating:4.5,totalReviews:8}});
  const salon=await result;
  expect(salon.address).toBe('12 Lê Lợi');expect(salon.district).toBe('Quận 1');expect(salon.city).toBe('Hồ Chí Minh');
  expect(salon.coordinates).toEqual({lat:10.77,lng:106.7});
 });
 it.each([
  {latitude:0,longitude:0},{latitude:0,longitude:106.7},{latitude:10.77,longitude:0},
  {latitude:-90,longitude:-180},{latitude:90,longitude:180},
 ])('keeps a genuine zero or boundary coordinate pair: %j',async coordinates=>{
  const result=api.detail('42');
  http.expectOne(apiConfig.baseUrl+'/customer/salons/42').flush({data:{id:42,name:'Tiệm Hoa',address:'12 Lê Lợi',city:'HCM',...coordinates}});
  expect((await result).coordinates).toEqual({lat:coordinates.latitude,lng:coordinates.longitude});
 });
 it.each([
  {},{latitude:null,longitude:null},{latitude:10.77},{longitude:106.7},
  {latitude:null,longitude:106.7},{latitude:10.77,longitude:null},
  {latitude:-90.1,longitude:106.7},{latitude:90.1,longitude:106.7},
  {latitude:10.77,longitude:-180.1},{latitude:10.77,longitude:180.1},
  {latitude:Number.NaN,longitude:106.7},{latitude:10.77,longitude:Number.POSITIVE_INFINITY},
  {latitude:Number.NEGATIVE_INFINITY,longitude:106.7},{latitude:'10.77',longitude:106.7},
 ])('leaves missing, partial or invalid coordinates absent instead of inventing a pin: %j',async coordinates=>{
  const result=api.detail('42');
  http.expectOne(apiConfig.baseUrl+'/customer/salons/42').flush({data:{id:42,name:'Tiệm Hoa',address:'12 Lê Lợi',city:'HCM',district:null,...coordinates}});
  const salon=await result;
  expect(salon.coordinates).toBeNull();expect(salon.district).toBeNull();
 });
 it('keeps each search result location independent when summaries omit coordinates',async()=>{
  const result=api.search();
  http.expectOne(r=>r.url.includes('/customer/salons?')).flush({data:{content:[
   {id:1,name:'Tiệm có vị trí',address:'12 Lê Lợi',city:'HCM',district:'Quận 1',latitude:10.77,longitude:106.7},
   {id:2,name:'Tiệm chưa có vị trí',address:'34 Nguyễn Huệ',city:'HCM'},
  ],last:true,totalElements:2,pageNumber:0}});
  const salons=(await result).content;
  expect(salons[0].coordinates).toEqual({lat:10.77,lng:106.7});expect(salons[0].district).toBe('Quận 1');
  expect(salons[1].coordinates).toBeNull();expect(salons[1].district).toBeUndefined();
 });
 it('preserves empty results and rejects errors instead of returning sample salons',async()=>{
  const empty=api.search();http.expectOne(r=>r.url.includes('/customer/salons?')).flush({data:{content:[],last:true,totalElements:0,pageNumber:0}});expect((await empty).content).toEqual([]);
  const failed=api.detail('42');const assertion=expect(failed).rejects.toBeDefined();http.expectOne(apiConfig.baseUrl+'/customer/salons/42').flush({}, {status:404,statusText:'Not Found'});await assertion;
 });
});
